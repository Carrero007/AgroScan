using AgroScan.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace AgroScan.Controllers
{
    [ApiController]
    [Route("[controller]")]
    public class GroqController : ControllerBase
    {
        private readonly IConfiguration _config;
        private readonly HttpClient _http;
        private string ConnStr => _config.GetConnectionString("DefaultConnection")!;

        public GroqController(IConfiguration config, IHttpClientFactory httpFactory)
        {
            _config = config;
            _http = httpFactory.CreateClient();
        }

        // ══════════════════════════════════════════════════════════
        // ENDPOINTS MULTIPART — testáveis pelo Swagger (upload de arquivo)
        // ══════════════════════════════════════════════════════════

        /// <summary>
        /// Identifica a espécie de uma planta a partir de uma imagem enviada como arquivo.
        /// Use este endpoint no Swagger: clique em "Try it out", selecione o arquivo e envie.
        /// </summary>
        /// <param name="imagem">Arquivo de imagem JPG/PNG/WEBP (máx 10 MB)</param>
        /// <param name="informacoesAdicionais">Contexto extra opcional (ex: local, características observadas)</param>
        [HttpPost("identificar-arquivo")]
        [Consumes("multipart/form-data")]
        public async Task<IActionResult> IdentificarArquivo(
            IFormFile imagem,
            [FromForm] string? informacoesAdicionais = null)
        {
            if (imagem == null || imagem.Length == 0)
                return BadRequest(new { erro = "Nenhum arquivo enviado." });

            var (base64, mimeType, erro) = await ProcessarArquivo(imagem);
            if (erro != null) return BadRequest(new { erro });

            var prompt = MontarPromptIdentificacao(informacoesAdicionais);
            return await ChamarGroq(prompt, base64!, mimeType!);
        }

        /// <summary>
        /// Diagnostica pragas, doenças e problemas de uma planta a partir de uma imagem enviada como arquivo.
        /// Use este endpoint no Swagger: clique em "Try it out", selecione o arquivo e envie.
        /// </summary>
        /// <param name="imagem">Arquivo de imagem JPG/PNG/WEBP — prefira foto da área afetada (máx 10 MB)</param>
        /// <param name="informacoesAdicionais">Sintomas observados, tempo, condições (melhora o diagnóstico)</param>
        [HttpPost("diagnosticar-arquivo")]
        [Consumes("multipart/form-data")]
        public async Task<IActionResult> DiagnosticarArquivo(
            IFormFile imagem,
            [FromForm] string? informacoesAdicionais = null)
        {
            if (imagem == null || imagem.Length == 0)
                return BadRequest(new { erro = "Nenhum arquivo enviado." });

            var (base64, mimeType, erro) = await ProcessarArquivo(imagem);
            if (erro != null) return BadRequest(new { erro });

            var prompt = MontarPromptDiagnostico(informacoesAdicionais);
            return await ChamarGroq(prompt, base64!, mimeType!);
        }

        // ══════════════════════════════════════════════════════════
        // ENDPOINTS JSON/BASE64 — usados pelo frontend HTML (agroscan-ia.html)
        // ══════════════════════════════════════════════════════════

        /// <summary>Identifica a espécie de uma planta a partir de imagem em Base64 (usado pelo frontend HTML).</summary>
        [HttpPost("identificar")]
        public async Task<IActionResult> Identificar([FromBody] AnaliseRequest req)
        {
            if (string.IsNullOrWhiteSpace(req.ImagemBase64))
                return BadRequest(new { erro = "ImagemBase64 é obrigatório." });

            var prompt = MontarPromptIdentificacao(req.InformacoesAdicionais);
            return await ChamarGroq(prompt, req.ImagemBase64, req.MimeType ?? "image/jpeg");
        }

        /// <summary>Diagnostica problemas de uma planta a partir de imagem em Base64 (usado pelo frontend HTML).</summary>
        [HttpPost("diagnosticar")]
        public async Task<IActionResult> Diagnosticar([FromBody] AnaliseRequest req)
        {
            if (string.IsNullOrWhiteSpace(req.ImagemBase64))
                return BadRequest(new { erro = "ImagemBase64 é obrigatório." });

            var prompt = MontarPromptDiagnostico(req.InformacoesAdicionais);
            return await ChamarGroq(prompt, req.ImagemBase64, req.MimeType ?? "image/jpeg");
        }

        // ══════════════════════════════════════════════════════════
        // CRUD DIAGNÓSTICOS
        // ══════════════════════════════════════════════════════════

        /// <summary>Salva um diagnóstico no banco de dados.</summary>
        [HttpPost("salvar")]
        public IActionResult Salvar([FromBody] Diagnostico d)
        {
            if (d == null) return BadRequest(new { erro = "Dados inválidos." });
            try
            {
                using var conn = new SqlConnection(ConnStr);
                var query = @"INSERT INTO Diagnosticos 
                    (PlantaId, NomeDoenca, NomeCientifico, Confianca, Tratamento, TratamentoEcologico, RiscoPropagacao, DataDiagnostico)
                    VALUES (@p1,@p2,@p3,@p4,@p5,@p6,@p7,@p8)";
                using var cmd = new SqlCommand(query, conn);
                cmd.Parameters.AddWithValue("@p1", d.PlantaId.HasValue ? (object)d.PlantaId.Value : DBNull.Value);
                cmd.Parameters.AddWithValue("@p2", d.NomeDoenca ?? "");
                cmd.Parameters.AddWithValue("@p3", d.NomeCientifico ?? "");
                cmd.Parameters.AddWithValue("@p4", d.Confianca);
                cmd.Parameters.AddWithValue("@p5", d.Tratamento ?? "");
                cmd.Parameters.AddWithValue("@p6", d.TratamentoEcologico ?? "");
                cmd.Parameters.AddWithValue("@p7", d.RiscoPropagacao ?? "");
                cmd.Parameters.AddWithValue("@p8", DateTime.Now);
                conn.Open();
                cmd.ExecuteNonQuery();
                return Ok(new { mensagem = "Diagnóstico salvo com sucesso!" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { erro = "Erro ao salvar.", detalhe = ex.Message });
            }
        }

        /// <summary>Lista todos os diagnósticos salvos, do mais recente ao mais antigo.</summary>
        [HttpGet("diagnosticos")]
        public IActionResult ListarDiagnosticos()
        {
            try
            {
                var lista = new List<Diagnostico>();
                using var conn = new SqlConnection(ConnStr);
                using var cmd = new SqlCommand("SELECT * FROM Diagnosticos ORDER BY DataDiagnostico DESC", conn);
                conn.Open();
                using var reader = cmd.ExecuteReader();
                while (reader.Read())
                {
                    lista.Add(new Diagnostico
                    {
                        DiagnosticoId = (int)reader["DiagnosticoId"],
                        PlantaId = reader["PlantaId"] == DBNull.Value ? null : (int?)reader["PlantaId"],
                        NomeDoenca = reader["NomeDoenca"].ToString(),
                        NomeCientifico = reader["NomeCientifico"].ToString(),
                        Confianca = reader["Confianca"] == DBNull.Value ? 0 : (int)reader["Confianca"],
                        Tratamento = reader["Tratamento"].ToString(),
                        TratamentoEcologico = reader["TratamentoEcologico"].ToString(),
                        RiscoPropagacao = reader["RiscoPropagacao"].ToString(),
                        DataDiagnostico = (DateTime)reader["DataDiagnostico"]
                    });
                }
                return Ok(lista);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { erro = "Erro ao listar.", detalhe = ex.Message });
            }
        }

        // ══════════════════════════════════════════════════════════
        // MÉTODOS PRIVADOS
        // ══════════════════════════════════════════════════════════

        /// <summary>Valida e converte IFormFile para Base64 + mimeType.</summary>
        private static async Task<(string? base64, string? mimeType, string? erro)> ProcessarArquivo(IFormFile arquivo)
        {
            if (arquivo.Length > 10 * 1024 * 1024)
                return (null, null, "Arquivo muito grande. Máximo: 10 MB.");

            var tiposPermitidos = new[] { "image/jpeg", "image/png", "image/webp", "image/gif" };
            var mime = arquivo.ContentType?.ToLower() ?? "image/jpeg";

            if (!tiposPermitidos.Contains(mime))
                return (null, null, $"Tipo não suportado: {mime}. Use JPG, PNG ou WEBP.");

            using var ms = new MemoryStream();
            await arquivo.CopyToAsync(ms);
            return (Convert.ToBase64String(ms.ToArray()), mime, null);
        }

        private static string MontarPromptIdentificacao(string? contexto)
        {
            var extra = string.IsNullOrWhiteSpace(contexto)
                ? ""
                : $"\n\nInformações fornecidas pelo usuário: {contexto}";

            return $@"Você é um especialista botânico com décadas de experiência em taxonomia vegetal.{extra}

Analise a imagem da planta com atenção a folhas, caule, flores, frutos e hábito de crescimento.
Responda APENAS com um JSON válido, sem markdown, sem texto adicional, neste formato exato:
{{
  ""nomeCientifico"": ""string"",
  ""nomePopular"": ""string"",
  ""familia"": ""string"",
  ""tipoPlanta"": ""string"",
  ""cicloVida"": ""string"",
  ""clima"": ""string"",
  ""luminosidade"": ""string"",
  ""rega"": ""string"",
  ""tipoSolo"": ""string"",
  ""origem"": ""string"",
  ""ehMedicinal"": false,
  ""ehComestivel"": false,
  ""ehToxica"": false,
  ""usos"": ""string"",
  ""descricao"": ""string"",
  ""confiancaIdentificacao"": 0
}}
Regras:
- confiancaIdentificacao: inteiro 0-100
- ehMedicinal, ehComestivel, ehToxica: true/false
- Se não identificado: use 'Não identificado' nos textos e 0 na confiança
- Nunca inclua markdown ou texto fora do JSON";
        }

        private static string MontarPromptDiagnostico(string? contexto)
        {
            var extra = string.IsNullOrWhiteSpace(contexto)
                ? ""
                : $"\n\nSintomas e informações relatados pelo usuário: {contexto}";

            return $@"Você é um fitopatologista e agrônomo especialista em diagnóstico de plantas.{extra}

Analise CUIDADOSAMENTE a imagem quanto a manchas, descolorações, necrose, fungos visíveis,
insetos, ácaros, galhas, deformações, murchas, podridões e deficiências nutricionais.

Responda APENAS com um JSON válido, sem markdown, sem texto adicional, neste formato exato:
{{
  ""tipoDiagnostico"": ""string"",
  ""nomeDoenca"": ""string"",
  ""nomeCientifico"": ""string"",
  ""agenteCausador"": ""string"",
  ""confianca"": 0,
  ""tipo"": ""string"",
  ""sintomasObservados"": ""string"",
  ""sintomasTipicos"": ""string"",
  ""condicoesFavoraveis"": ""string"",
  ""gravidade"": ""string"",
  ""gravidadeNivel"": 0,
  ""tratamentoPasso1"": ""string"",
  ""tratamentoPasso2"": ""string"",
  ""tratamentoPasso3"": ""string"",
  ""tratamentoEcologico"": ""string"",
  ""tratamentoQuimico"": ""string"",
  ""prevencao"": ""string"",
  ""riscoPropagacao"": ""string"",
  ""riscoPropagacaoNivel"": 0,
  ""riscoPropagacaoTexto"": ""string"",
  ""plantasAfetadas"": ""string""
}}
Regras:
- tipoDiagnostico: 'Doença Fúngica', 'Doença Bacteriana', 'Vírus', 'Praga de Inseto', 'Praga de Ácaro', 'Deficiência Nutricional', 'Dano Físico' ou 'Saudável'
- confianca: inteiro 0-100
- gravidadeNivel: inteiro 0-10
- riscoPropagacaoNivel: inteiro 0-10
- riscoPropagacao: 'baixo', 'medio' ou 'alto'
- gravidade: 'baixa', 'media' ou 'alta'
- Nunca inclua markdown ou texto fora do JSON";
        }

        /// <summary>
        /// Chama a Groq API com visão multimodal.
        /// A API Key é lida do appsettings.json (servidor) — NUNCA exposta ao cliente.
        /// </summary>
        private async Task<IActionResult> ChamarGroq(string systemPrompt, string imagemBase64, string mimeType)
        {
            var apiKey = _config["Groq:ApiKey"];
            var model = _config["Groq:Model"] ?? "meta-llama/llama-4-scout-17b-16e-instruct";

            if (string.IsNullOrWhiteSpace(apiKey))
                return StatusCode(500, new { erro = "Groq API Key não configurada no servidor." });

            try
            {
                var request = new HttpRequestMessage(
                    HttpMethod.Post,
                    "https://api.groq.com/openai/v1/chat/completions");

                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);

                var messages = new List<object>
                {
                    new { role = "system", content = systemPrompt },
                    new
                    {
                        role = "user",
                        content = new List<object>
                        {
                            new
                            {
                                type = "image_url",
                                image_url = new { url = $"data:{mimeType};base64,{imagemBase64}" }
                            },
                            new
                            {
                                type = "text",
                                text = "Analise esta imagem e responda conforme as instruções."
                            }
                        }
                    }
                };

                request.Content = new StringContent(
                    JsonSerializer.Serialize(new { model, max_tokens = 1200, temperature = 0.2, messages }),
                    Encoding.UTF8,
                    "application/json");

                var response = await _http.SendAsync(request);
                var raw = await response.Content.ReadAsStringAsync();

                if (!response.IsSuccessStatusCode)
                    return StatusCode((int)response.StatusCode, new { erro = "Erro na API Groq.", detalhe = raw });

                using var doc = JsonDocument.Parse(raw);
                var text = doc.RootElement
                    .GetProperty("choices")[0]
                    .GetProperty("message")
                    .GetProperty("content")
                    .GetString() ?? "{}";

                // Remove markdown residual e extrai somente o bloco JSON
                text = text.Replace("```json", "").Replace("```", "").Trim();
                var jsonStart = text.IndexOf('{');
                var jsonEnd = text.LastIndexOf('}');
                if (jsonStart >= 0 && jsonEnd > jsonStart)
                    text = text[jsonStart..(jsonEnd + 1)];

                try
                {
                    return Ok(JsonDocument.Parse(text).RootElement);
                }
                catch
                {
                    return Ok(new { raw = text });
                }
            }
            catch (HttpRequestException ex)
            {
                return StatusCode(503, new { erro = "Falha na comunicação com a Groq.", detalhe = ex.Message });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { erro = "Erro interno.", detalhe = ex.Message });
            }
        }
    }

    // ── DTOs ──
    public class AnaliseRequest
    {
        public string ImagemBase64 { get; set; } = string.Empty;
        public string MimeType { get; set; } = "image/jpeg";
        public string? InformacoesAdicionais { get; set; }
    }
}