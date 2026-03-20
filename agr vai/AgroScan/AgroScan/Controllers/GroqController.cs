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
        private const string ConnStr = "Data Source=(localdb)\\MSSQLLocalDB;Initial Catalog=AgroScan;Integrated Security=True";

        public GroqController(IConfiguration config, IHttpClientFactory httpFactory)
        {
            _config = config;
            _http = httpFactory.CreateClient();
        }

        // POST /Groq/identificar  — identifica espécie da planta
        [HttpPost("identificar")]
        public async Task<IActionResult> Identificar([FromBody] ImagemRequest req)
        {
            var prompt = @"Você é um especialista botânico. Analise a imagem desta planta e responda APENAS com um JSON válido, sem markdown, neste formato exato:
{
  ""nomeCientifico"": ""string"",
  ""nomePopular"": ""string"",
  ""tipoPlanta"": ""string"",
  ""clima"": ""string"",
  ""luminosidade"": ""string"",
  ""rega"": ""string"",
  ""descricao"": ""string""
}
Preencha todos os campos. Se não conseguir identificar, use 'Não identificado' nos campos de texto.";

            return await ChamarGroq(prompt, req.ImagemBase64, req.MimeType);
        }

        // POST /Groq/diagnosticar  — diagnostica doença da planta
        [HttpPost("diagnosticar")]
        public async Task<IActionResult> Diagnosticar([FromBody] DiagnosticoRequest req)
        {
            var descricaoTexto = string.IsNullOrEmpty(req.Descricao) ? "" : $"\n\nDescrição do problema relatada pelo usuário: {req.Descricao}";
            var prompt = $@"Você é um fitopatologista especialista. Analise a imagem desta planta{descricaoTexto}
Responda APENAS com um JSON válido, sem markdown, neste formato exato:
{{
  ""nomeDoenca"": ""string"",
  ""nomeCientifico"": ""string"",
  ""confianca"": 0,
  ""tipo"": ""string"",
  ""sintomasTipicos"": ""string"",
  ""condicoesFavoraveis"": ""string"",
  ""tratamentoPasso1"": ""string"",
  ""tratamentoPasso2"": ""string"",
  ""tratamentoPasso3"": ""string"",
  ""tratamentoEcologico"": ""string"",
  ""prevencao"": ""string"",
  ""riscoPropagacao"": ""string"",
  ""riscoPropagacaoNivel"": 0,
  ""riscoPropagacaoTexto"": ""string""
}}
Onde: confianca é um número de 0 a 100; riscoPropagacaoNivel é de 0 a 10; riscoPropagacao é 'baixo', 'medio' ou 'alto'.";

            return await ChamarGroq(prompt, req.ImagemBase64, req.MimeType);
        }

        // POST /Groq/salvar  — salva diagnóstico no banco
        [HttpPost("salvar")]
        public IActionResult Salvar([FromBody] Diagnostico d)
        {
            using var conn = new SqlConnection(ConnStr);
            var query = @"INSERT INTO Diagnosticos 
                (PlantaId, NomeDoenca, NomeCientifico, Confianca, Tratamento, TratamentoEcologico, RiscoPropagacao, DataDiagnostico)
                VALUES (@p1,@p2,@p3,@p4,@p5,@p6,@p7,@p8)";
            var cmd = new SqlCommand(query, conn);
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

        // GET /Groq/diagnosticos  — lista todos os diagnósticos
        [HttpGet("diagnosticos")]
        public IActionResult ListarDiagnosticos()
        {
            var lista = new List<Diagnostico>();
            using var conn = new SqlConnection(ConnStr);
            var cmd = new SqlCommand("SELECT * FROM Diagnosticos ORDER BY DataDiagnostico DESC", conn);
            conn.Open();
            var reader = cmd.ExecuteReader();
            while (reader.Read())
            {
                lista.Add(new Diagnostico
                {
                    DiagnosticoId = (int)reader["DiagnosticoId"],
                    PlantaId = reader["PlantaId"] == DBNull.Value ? null : (int?)reader["PlantaId"],
                    NomeDoenca = reader["NomeDoenca"].ToString(),
                    NomeCientifico = reader["NomeCientifico"].ToString(),
                    Confianca = (int)reader["Confianca"],
                    Tratamento = reader["Tratamento"].ToString(),
                    TratamentoEcologico = reader["TratamentoEcologico"].ToString(),
                    RiscoPropagacao = reader["RiscoPropagacao"].ToString(),
                    DataDiagnostico = (DateTime)reader["DataDiagnostico"]
                });
            }
            return Ok(lista);
        }

        // ── Método privado que chama a Groq ──
        private async Task<IActionResult> ChamarGroq(string systemPrompt, string imagemBase64, string mimeType)
        {
            var apiKey = _config["Groq:ApiKey"];
            var model = _config["Groq:Model"] ?? "meta-llama/llama-4-scout-17b-16e-instruct";

            _http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);

            // Monta as mensagens como lista de objetos dinâmicos para evitar conflito de tipos
            var messages = new List<object>
    {
        new
        {
            role = "system",
            content = systemPrompt
        },
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

            var body = new
            {
                model,
                max_tokens = 1000,
                temperature = 0.3,
                messages
            };

            var json = JsonSerializer.Serialize(body);
            var content = new StringContent(json, Encoding.UTF8, "application/json");
            var response = await _http.PostAsync("https://api.groq.com/openai/v1/chat/completions", content);
            var raw = await response.Content.ReadAsStringAsync();

            if (!response.IsSuccessStatusCode)
                return StatusCode((int)response.StatusCode, new { erro = raw });

            using var doc = JsonDocument.Parse(raw);
            var text = doc.RootElement
                .GetProperty("choices")[0]
                .GetProperty("message")
                .GetProperty("content")
                .GetString() ?? "{}";

            text = text.Replace("```json", "").Replace("```", "").Trim();

            try
            {
                var parsed = JsonDocument.Parse(text);
                return Ok(parsed.RootElement);
            }
            catch
            {
                return Ok(new { raw = text });
            }
        }
    }

    // ── DTOs ──
    public class ImagemRequest
    {
        public string ImagemBase64 { get; set; }
        public string MimeType { get; set; } = "image/jpeg";
    }

    public class DiagnosticoRequest : ImagemRequest
    {
        public string Descricao { get; set; }
    }
}