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
            return await ChamarGroq(prompt, base64!, mimeType!, 1200);
        }

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
            return await ChamarGroq(prompt, base64!, mimeType!, 2000);
        }

        // ══════════════════════════════════════════════════════════
        // ENDPOINTS JSON/BASE64 — usados pelo frontend HTML
        // ══════════════════════════════════════════════════════════

        [HttpPost("identificar")]
        public async Task<IActionResult> Identificar([FromBody] AnaliseRequest req)
        {
            if (string.IsNullOrWhiteSpace(req.ImagemBase64))
                return BadRequest(new { erro = "ImagemBase64 é obrigatório." });

            var prompt = MontarPromptIdentificacao(req.InformacoesAdicionais);
            return await ChamarGroq(prompt, req.ImagemBase64, req.MimeType ?? "image/jpeg", 1200);
        }

        [HttpPost("diagnosticar")]
        public async Task<IActionResult> Diagnosticar([FromBody] AnaliseRequest req)
        {
            if (string.IsNullOrWhiteSpace(req.ImagemBase64))
                return BadRequest(new { erro = "ImagemBase64 é obrigatório." });

            var prompt = MontarPromptDiagnostico(req.InformacoesAdicionais);
            return await ChamarGroq(prompt, req.ImagemBase64, req.MimeType ?? "image/jpeg", 2000);
        }

        // ══════════════════════════════════════════════════════════
        // CRUD DIAGNÓSTICOS
        // ══════════════════════════════════════════════════════════

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
                : $"\n\nInformações fornecidas pelo usuário:\n{contexto}";

            return $@"Você é um especialista botânico em taxonomia vegetal.{extra}

Analise a imagem da planta (folhas, caule, flores, frutos, hábito de crescimento).
Responda APENAS com JSON válido, sem markdown, sem texto extra:
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
Regras: confiancaIdentificacao 0-100 (int). ehMedicinal/ehComestivel/ehToxica true/false. Se não identificado use 'Não identificado' e confiança 0.";
        }

        private static string MontarPromptDiagnostico(string? contexto)
        {
            // Prompt propositalmente compacto — prompts longos no system + imagem causam 400 (token limit de entrada)
            var extra = string.IsNullOrWhiteSpace(contexto)
                ? ""
                : $"\n\nDados do usuário:\n{contexto}";

            return $@"Você é um fitopatologista especialista em diagnóstico de plantas.{extra}

Analise a imagem: manchas, descolorações, necrose, fungos, insetos, ácaros, galhas, deformações, murchas, podridões, deficiências nutricionais.
Responda APENAS com JSON válido, sem markdown, sem texto extra:
{{
  ""tipoDiagnostico"": ""string"",
  ""nomeDoenca"": ""string"",
  ""nomeCientifico"": ""string"",
  ""agenteCausador"": ""string"",
  ""confianca"": 0,
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
Regras: tipoDiagnostico deve ser um de: 'Doença Fúngica','Doença Bacteriana','Vírus','Praga de Inseto','Praga de Ácaro','Deficiência Nutricional','Dano Físico','Saudável'. confianca 0-100 (int). gravidadeNivel 0-10 (int). riscoPropagacaoNivel 0-10 (int). riscoPropagacao: 'baixo','medio' ou 'alto'. gravidade: 'baixa','media' ou 'alta'.";
        }

        /// <summary>
        /// Chama a Groq API com visão multimodal.
        /// Em caso de erro, o body completo da Groq é retornado em "detalhe" para facilitar debug.
        /// </summary>
        private async Task<IActionResult> ChamarGroq(string systemPrompt, string imagemBase64, string mimeType, int maxTokens = 1200)
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

                var payload = JsonSerializer.Serialize(new
                {
                    model,
                    max_tokens = maxTokens,
                    temperature = 0.2,
                    messages
                });

                request.Content = new StringContent(payload, Encoding.UTF8, "application/json");

                var response = await _http.SendAsync(request);
                var raw = await response.Content.ReadAsStringAsync();

                if (!response.IsSuccessStatusCode)
                {
                    // Expõe o body exato da Groq — use para ver a mensagem real do erro 400
                    return StatusCode((int)response.StatusCode, new
                    {
                        erro = $"Erro na API Groq. Status: {(int)response.StatusCode}. Modelo: {model}.",
                        detalhe = raw
                    });
                }

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