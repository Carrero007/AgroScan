using AgroScan.Models;
using AgroScan.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using System.Net.Http.Headers;
using System.Security.Claims;
using System.Text;
using System.Text.Json;

namespace AgroScan.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class DiagnosticoController : ControllerBase
    {
        private readonly IConfiguration _config;
        private readonly HttpClient _http;
        private readonly ILogger<DiagnosticoController> _logger;
        private string ConnStr => _config.GetConnectionString("DefaultConnection")!;

        private int UsuarioIdAtual
        {
            get
            {
                var sub = User.FindFirst("sub")?.Value;
                return int.TryParse(sub, out var id) ? id : 0;
            }
        }

        public DiagnosticoController(
            IConfiguration config,
            IHttpClientFactory httpFactory,
            ILogger<DiagnosticoController> logger)
        {
            _config = config;
            _http = httpFactory.CreateClient();
            _logger = logger;
        }

        // ── Diagnóstico via multipart (Swagger) ──────────────────

        [HttpPost("diagnosticar-arquivo")]
        [Consumes("multipart/form-data")]
        public async Task<IActionResult> DiagnosticarArquivo(
            IFormFile imagem,
            [FromForm] string? hortalicaNome = null,
            [FromForm] string? regiaoClima = null,
            [FromForm] string? estagioPlanta = null,
            [FromForm] string? sintomasDescricao = null,
            [FromForm] string? condicoesClimaticas = null,
            [FromForm] string? tratamentosAnteriores = null)
        {
            if (imagem == null || imagem.Length == 0)
                return BadRequest(new { erro = "Nenhum arquivo enviado." });

            var (base64, mime, erro) = await ProcessarArquivo(imagem);
            if (erro != null) return BadRequest(new { erro });

            var req = new AnaliseRequest
            {
                ImagemBase64 = base64!,
                MimeType = mime!,
                HortalicaNome = hortalicaNome,
                RegiaoClima = regiaoClima,
                EstagioPlanta = estagioPlanta,
                SintomasDescricao = sintomasDescricao,
                CondicoesClimaticas = condicoesClimaticas,
                TratamentosAnteriores = tratamentosAnteriores
            };

            var (system, userText) = PromptService.MontarPromptDiagnostico(req);
            return await ChamarGroq(system, userText, base64!, mime!, "diagnosticar",
                UsuarioIdAtual, HttpContext.Connection.RemoteIpAddress?.ToString() ?? "");
        }

        // ── Diagnóstico via JSON/base64 (frontend) ───────────────

        [HttpPost("diagnosticar")]
        public async Task<IActionResult> Diagnosticar([FromBody] AnaliseRequest req)
        {
            if (string.IsNullOrWhiteSpace(req.ImagemBase64))
                return BadRequest(new { erro = "ImagemBase64 e obrigatorio." });

            var (system, userText) = PromptService.MontarPromptDiagnostico(req);
            return await ChamarGroq(system, userText, req.ImagemBase64,
                req.MimeType ?? "image/jpeg", "diagnosticar",
                UsuarioIdAtual, HttpContext.Connection.RemoteIpAddress?.ToString() ?? "");
        }

        // ── Identificação via multipart (Swagger) ────────────────

        [HttpPost("identificar-arquivo")]
        [Consumes("multipart/form-data")]
        public async Task<IActionResult> IdentificarArquivo(
            IFormFile imagem,
            [FromForm] string? regiaoClima = null)
        {
            if (imagem == null || imagem.Length == 0)
                return BadRequest(new { erro = "Nenhum arquivo enviado." });

            var (base64, mime, erro) = await ProcessarArquivo(imagem);
            if (erro != null) return BadRequest(new { erro });

            var req = new AnaliseRequest { ImagemBase64 = base64!, MimeType = mime!, RegiaoClima = regiaoClima };
            var (system, userText) = PromptService.MontarPromptIdentificacao(req);
            return await ChamarGroq(system, userText, base64!, mime!, "identificar",
                UsuarioIdAtual, HttpContext.Connection.RemoteIpAddress?.ToString() ?? "");
        }

        // ── Identificação via JSON/base64 (frontend) ─────────────

        [HttpPost("identificar")]
        public async Task<IActionResult> Identificar([FromBody] AnaliseRequest req)
        {
            if (string.IsNullOrWhiteSpace(req.ImagemBase64))
                return BadRequest(new { erro = "ImagemBase64 e obrigatorio." });

            var (system, userText) = PromptService.MontarPromptIdentificacao(req);
            return await ChamarGroq(system, userText, req.ImagemBase64,
                req.MimeType ?? "image/jpeg", "identificar",
                UsuarioIdAtual, HttpContext.Connection.RemoteIpAddress?.ToString() ?? "");
        }

        // ── Salvar diagnóstico ────────────────────────────────────

        [HttpPost("salvar")]
        public IActionResult Salvar([FromBody] Diagnostico d)
        {
            if (d == null) return BadRequest(new { erro = "Dados invalidos." });
            d.UsuarioId = UsuarioIdAtual;

            try
            {
                using var conn = new SqlConnection(ConnStr);
                const string sql = @"
                    INSERT INTO Diagnosticos
                        (UsuarioId, HortalicaId, TipoDiagnostico, NomeDoenca, NomeCientifico,
                         AgenteCausador, Confianca, GravidadeNivel, Gravidade, SintomasObservados,
                         Tratamento, TratamentoEcologico, TratamentoQuimico, Prevencao,
                         RiscoPropagacao, RiscoPropagacaoNivel, PlantasAfetadas, CondicoesFavoraveis)
                    VALUES
                        (@uid,@hid,@tipo,@doenca,@nc,@agente,@conf,@gnivel,@grav,@sint,
                         @trat,@treco,@trqui,@prev,@risco,@rnivel,@plantas,@cond)";

                using var cmd = new SqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("@uid", d.UsuarioId);
                cmd.Parameters.AddWithValue("@hid", (object?)d.HortalicaId ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@tipo", d.TipoDiagnostico ?? "");
                cmd.Parameters.AddWithValue("@doenca", d.NomeDoenca ?? "");
                cmd.Parameters.AddWithValue("@nc", d.NomeCientifico ?? "");
                cmd.Parameters.AddWithValue("@agente", d.AgenteCausador ?? "");
                cmd.Parameters.AddWithValue("@conf", d.Confianca);
                cmd.Parameters.AddWithValue("@gnivel", d.GravidadeNivel);
                cmd.Parameters.AddWithValue("@grav", d.Gravidade ?? "");
                cmd.Parameters.AddWithValue("@sint", d.SintomasObservados ?? "");
                cmd.Parameters.AddWithValue("@trat", d.Tratamento ?? "");
                cmd.Parameters.AddWithValue("@treco", d.TratamentoEcologico ?? "");
                cmd.Parameters.AddWithValue("@trqui", d.TratamentoQuimico ?? "");
                cmd.Parameters.AddWithValue("@prev", d.Prevencao ?? "");
                cmd.Parameters.AddWithValue("@risco", d.RiscoPropagacao ?? "");
                cmd.Parameters.AddWithValue("@rnivel", d.RiscoPropagacaoNivel);
                cmd.Parameters.AddWithValue("@plantas", d.PlantasAfetadas ?? "");
                cmd.Parameters.AddWithValue("@cond", d.CondicoesFavoraveis ?? "");
                conn.Open();
                cmd.ExecuteNonQuery();
                return Ok(new { mensagem = "Diagnostico salvo com sucesso!" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Erro ao salvar diagnostico.");
                return StatusCode(500, new { erro = "Erro ao salvar.", detalhe = ex.Message });
            }
        }

        // ── Salvar hortaliça identificada ─────────────────────────

        [HttpPost("salvar-hortalica")]
        public IActionResult SalvarHortalica([FromBody] Hortalica h)
        {
            if (h == null || string.IsNullOrWhiteSpace(h.NomeCientifico))
                return BadRequest(new { erro = "NomeCientifico e obrigatorio." });

            try
            {
                using var conn = new SqlConnection(ConnStr);

                // Verifica se já existe para não duplicar
                using (var chk = new SqlCommand(
                    "SELECT COUNT(1) FROM Hortalicas WHERE NomeCientifico = @nc", conn))
                {
                    chk.Parameters.AddWithValue("@nc", h.NomeCientifico);
                    conn.Open();
                    var existe = (int)chk.ExecuteScalar() > 0;
                    if (existe)
                        return Ok(new { mensagem = "Hortalica ja existe no catalogo.", jaExistia = true });
                }

                const string sql = @"
                    INSERT INTO Hortalicas
                        (NomeCientifico, NomePopular, Familia, Categoria, CicloVida, DiasGerminacao,
                         DiasColheita, Espacamento, Clima, Luminosidade, Irrigacao, TipoSolo,
                         PHMin, PHMax, Adubacao, PragasPrincipais, DoencasPrincipais, Origem,
                         ValorNutricional, Observacoes)
                    VALUES
                        (@nc,@np,@fam,@cat,@ciclo,@dg,@dc,@esp,@clim,@lum,@irrig,
                         @solo,@phmin,@phmax,@adub,@pragas,@doencas,@orig,@nutri,@obs)";

                using var cmd = new SqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("@nc", h.NomeCientifico);
                cmd.Parameters.AddWithValue("@np", (object?)h.NomePopular ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@fam", (object?)h.Familia ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@cat", (object?)h.Categoria ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@ciclo", (object?)h.CicloVida ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@dg", (object?)h.DiasGerminacao ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@dc", (object?)h.DiasColheita ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@esp", (object?)h.Espacamento ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@clim", (object?)h.Clima ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@lum", (object?)h.Luminosidade ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@irrig", (object?)h.Irrigacao ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@solo", (object?)h.TipoSolo ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@phmin", (object?)h.PHMin ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@phmax", (object?)h.PHMax ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@adub", (object?)h.Adubacao ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@pragas", (object?)h.PragasPrincipais ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@doencas", (object?)h.DoencasPrincipais ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@orig", (object?)h.Origem ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@nutri", (object?)h.ValorNutricional ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@obs", (object?)h.Observacoes ?? DBNull.Value);
                cmd.ExecuteNonQuery();

                return Ok(new { mensagem = "Hortalica salva no catalogo!", jaExistia = false });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Erro ao salvar hortalica.");
                return StatusCode(500, new { erro = "Erro ao salvar.", detalhe = ex.Message });
            }
        }

        // ── Histórico paginado do usuário ─────────────────────────

        [HttpGet("historico")]
        public IActionResult Historico([FromQuery] int pagina = 1, [FromQuery] int tamanhoPagina = 20)
        {
            if (pagina < 1) pagina = 1;
            if (tamanhoPagina is < 1 or > 100) tamanhoPagina = 20;
            var offset = (pagina - 1) * tamanhoPagina;

            try
            {
                var lista = new List<Diagnostico>();
                using var conn = new SqlConnection(ConnStr);
                const string sql = @"
                    SELECT * FROM Diagnosticos WHERE UsuarioId = @uid
                    ORDER BY DataDiagnostico DESC
                    OFFSET @offset ROWS FETCH NEXT @tam ROWS ONLY";

                using var cmd = new SqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("@uid", UsuarioIdAtual);
                cmd.Parameters.AddWithValue("@offset", offset);
                cmd.Parameters.AddWithValue("@tam", tamanhoPagina);
                conn.Open();
                using var reader = cmd.ExecuteReader();
                while (reader.Read()) lista.Add(MapDiagnostico(reader));

                return Ok(new { pagina, tamanhoPagina, dados = lista });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Erro ao listar historico.");
                return StatusCode(500, new { erro = "Erro ao listar.", detalhe = ex.Message });
            }
        }

        // ── Estatísticas ──────────────────────────────────────────

        [HttpGet("estatisticas")]
        public IActionResult Estatisticas()
        {
            try
            {
                using var conn = new SqlConnection(ConnStr);
                const string sql = @"
                    SELECT TipoDiagnostico, COUNT(*) AS Total,
                           AVG(CAST(Confianca AS FLOAT)) AS ConfiancaMedia,
                           SUM(CASE WHEN Gravidade = 'alta' THEN 1 ELSE 0 END) AS TotalGraveAlta
                    FROM Diagnosticos WHERE UsuarioId = @uid
                    GROUP BY TipoDiagnostico ORDER BY Total DESC";

                using var cmd = new SqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("@uid", UsuarioIdAtual);
                conn.Open();
                using var reader = cmd.ExecuteReader();
                var stats = new List<object>();
                while (reader.Read())
                    stats.Add(new
                    {
                        tipo = reader["TipoDiagnostico"].ToString(),
                        total = (int)reader["Total"],
                        confiancaMedia = Math.Round((double)reader["ConfiancaMedia"], 1),
                        totalGraveAlta = (int)reader["TotalGraveAlta"]
                    });
                return Ok(stats);
            }
            catch (Exception ex) { return StatusCode(500, new { erro = ex.Message }); }
        }

        // ── Helpers privados ──────────────────────────────────────

        private static async Task<(string? base64, string? mime, string? erro)> ProcessarArquivo(IFormFile arquivo)
        {
            if (arquivo.Length > 10 * 1024 * 1024)
                return (null, null, "Arquivo muito grande. Maximo: 10 MB.");

            var tiposPermitidos = new[] { "image/jpeg", "image/png", "image/webp" };
            var mime = arquivo.ContentType?.ToLower() ?? "image/jpeg";
            if (!tiposPermitidos.Contains(mime))
                return (null, null, $"Tipo nao suportado: {mime}. Use JPG, PNG ou WEBP.");

            using var ms = new MemoryStream();
            await arquivo.CopyToAsync(ms);
            return (Convert.ToBase64String(ms.ToArray()), mime, null);
        }

        /// <summary>
        /// Chama a Groq Vision API.
        ///
        /// ATENÇÃO — serialização:
        /// System.Text.Json NÃO serializa tipos anônimos corretamente quando
        /// estão dentro de object[] inline no objeto raiz do Serialize().
        /// O compilador infere o tipo como 'object' e o serializer só enxerga
        /// as propriedades de 'object' (nenhuma), gerando {}.
        ///
        /// SOLUÇÃO: declarar as listas FORA do Serialize() com var (tipo real preservado)
        /// e passar como variáveis — exatamente como o GroqController original fazia.
        /// </summary>
        private async Task<IActionResult> ChamarGroq(
            string systemPrompt,
            string userText,
            string imagemBase64,
            string mimeType,
            string acao,
            int usuarioId,
            string ip)
        {
            var apiKey = _config["Groq:ApiKey"];
            var model = _config["Groq:Model"] ?? "meta-llama/llama-4-scout-17b-16e-instruct";

            if (string.IsNullOrWhiteSpace(apiKey))
                return StatusCode(500, new { erro = "Groq:ApiKey nao configurada no appsettings.json." });

            try
            {
                // Monta o content do user message como List<object>
                // (CRÍTICO: var local preserva o tipo real para o serializer)
                var userContent = new List<object>
                {
                    new
                    {
                        type      = "image_url",
                        image_url = new { url = $"data:{mimeType};base64,{imagemBase64}" }
                    },
                    new
                    {
                        type = "text",
                        text = userText
                    }
                };

                // Monta a lista de messages como List<object>
                var messages = new List<object>
                {
                    new { role = "system", content = systemPrompt },
                    new { role = "user",   content = userContent  }
                };

                // Serializa com todas as listas já resolvidas como tipos concretos
                var payload = JsonSerializer.Serialize(new
                {
                    model,
                    max_tokens = 1500,
                    temperature = 0.2,
                    messages
                });

                using var httpReq = new HttpRequestMessage(
                    HttpMethod.Post,
                    "https://api.groq.com/openai/v1/chat/completions");

                httpReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
                httpReq.Content = new StringContent(payload, Encoding.UTF8, "application/json");

                var resp = await _http.SendAsync(httpReq);
                var raw = await resp.Content.ReadAsStringAsync();

                if (!resp.IsSuccessStatusCode)
                {
                    _logger.LogError("Groq {Status}: {Body}", (int)resp.StatusCode, raw);
                    return StatusCode((int)resp.StatusCode, new
                    {
                        erro = $"Erro na API Groq (HTTP {(int)resp.StatusCode}).",
                        detalhe = raw
                    });
                }

                // Auditoria em background — parâmetros capturados, sem acesso ao HttpContext
                var connStr = ConnStr;
                _ = Task.Run(() => RegistrarAudit(acao, model, raw, usuarioId, ip, connStr));

                using var doc = JsonDocument.Parse(raw);
                var text = doc.RootElement
                    .GetProperty("choices")[0]
                    .GetProperty("message")
                    .GetProperty("content")
                    .GetString() ?? "{}";

                // Remove markdown residual
                text = text.Replace("```json", "").Replace("```", "").Trim();
                var start = text.IndexOf('{');
                var end = text.LastIndexOf('}');
                if (start >= 0 && end > start)
                    text = text[start..(end + 1)];

                try { return Ok(JsonDocument.Parse(text).RootElement); }
                catch { return Ok(new { raw = text, aviso = "Resposta fora do formato JSON esperado." }); }
            }
            catch (HttpRequestException ex)
            {
                return StatusCode(503, new { erro = "Falha na comunicacao com a Groq.", detalhe = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Erro interno ao chamar Groq.");
                return StatusCode(500, new { erro = "Erro interno.", detalhe = ex.Message });
            }
        }

        private static void RegistrarAudit(string acao, string model, string raw,
            int usuarioId, string ip, string connStr)
        {
            try
            {
                int tokens = 0;
                using var doc = JsonDocument.Parse(raw);
                if (doc.RootElement.TryGetProperty("usage", out var usage) &&
                    usage.TryGetProperty("total_tokens", out var t))
                    tokens = t.GetInt32();

                using var conn = new SqlConnection(connStr);
                const string sql = @"
                    INSERT INTO AuditLog (UsuarioId, Acao, IP, Modelo, TokensUsados)
                    VALUES (@uid, @acao, @ip, @model, @tokens)";
                using var cmd = new SqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("@uid", usuarioId);
                cmd.Parameters.AddWithValue("@acao", acao);
                cmd.Parameters.AddWithValue("@ip", string.IsNullOrEmpty(ip) ? (object)DBNull.Value : ip);
                cmd.Parameters.AddWithValue("@model", model);
                cmd.Parameters.AddWithValue("@tokens", tokens);
                conn.Open();
                cmd.ExecuteNonQuery();
            }
            catch { }
        }

        private static Diagnostico MapDiagnostico(SqlDataReader r) => new()
        {
            DiagnosticoId = (int)r["DiagnosticoId"],
            UsuarioId = r["UsuarioId"] == DBNull.Value ? null : (int?)r["UsuarioId"],
            HortalicaId = r["HortalicaId"] == DBNull.Value ? null : (int?)r["HortalicaId"],
            TipoDiagnostico = r["TipoDiagnostico"] == DBNull.Value ? null : r["TipoDiagnostico"].ToString(),
            NomeDoenca = r["NomeDoenca"] == DBNull.Value ? null : r["NomeDoenca"].ToString(),
            NomeCientifico = r["NomeCientifico"] == DBNull.Value ? null : r["NomeCientifico"].ToString(),
            AgenteCausador = r["AgenteCausador"] == DBNull.Value ? null : r["AgenteCausador"].ToString(),
            Confianca = r["Confianca"] == DBNull.Value ? 0 : (int)r["Confianca"],
            GravidadeNivel = r["GravidadeNivel"] == DBNull.Value ? 0 : (int)r["GravidadeNivel"],
            Gravidade = r["Gravidade"] == DBNull.Value ? null : r["Gravidade"].ToString(),
            SintomasObservados = r["SintomasObservados"] == DBNull.Value ? null : r["SintomasObservados"].ToString(),
            Tratamento = r["Tratamento"] == DBNull.Value ? null : r["Tratamento"].ToString(),
            TratamentoEcologico = r["TratamentoEcologico"] == DBNull.Value ? null : r["TratamentoEcologico"].ToString(),
            TratamentoQuimico = r["TratamentoQuimico"] == DBNull.Value ? null : r["TratamentoQuimico"].ToString(),
            Prevencao = r["Prevencao"] == DBNull.Value ? null : r["Prevencao"].ToString(),
            RiscoPropagacao = r["RiscoPropagacao"] == DBNull.Value ? null : r["RiscoPropagacao"].ToString(),
            RiscoPropagacaoNivel = r["RiscoPropagacaoNivel"] == DBNull.Value ? 0 : (int)r["RiscoPropagacaoNivel"],
            PlantasAfetadas = r["PlantasAfetadas"] == DBNull.Value ? null : r["PlantasAfetadas"].ToString(),
            CondicoesFavoraveis = r["CondicoesFavoraveis"] == DBNull.Value ? null : r["CondicoesFavoraveis"].ToString(),
            DataDiagnostico = (DateTime)r["DataDiagnostico"]
        };
    }
}