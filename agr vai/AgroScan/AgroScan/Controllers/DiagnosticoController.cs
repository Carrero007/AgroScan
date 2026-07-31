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
        private object? BuscarDiagnosticoDemo(AnaliseRequest req)
        {
            if (string.IsNullOrWhiteSpace(req.NomeArquivo))
                return null;

            var nomeArquivo = Path
                .GetFileNameWithoutExtension(req.NomeArquivo)
                .ToLower()
                .Trim();

            using var conn = new SqlConnection(ConnStr);

            const string sql = @"
        SELECT TOP 1 d.*
        FROM DiagnosticosDemo dd
        INNER JOIN Diagnosticos d
            ON d.DiagnosticoId = dd.DiagnosticoId
        WHERE LOWER(dd.NomeArquivo) = @nome";

            using var cmd = new SqlCommand(sql, conn);

            cmd.Parameters.AddWithValue("@nome", nomeArquivo);

            conn.Open();

            using var reader = cmd.ExecuteReader();

            if (!reader.Read())
                return null;

            return new
            {
                tipoDiagnostico = reader["TipoDiagnostico"]?.ToString(),
                nomeDoenca = reader["NomeDoenca"]?.ToString(),
                nomeCientifico = reader["NomeCientifico"]?.ToString(),
                agenteCausador = reader["AgenteCausador"]?.ToString(),
                confianca = Convert.ToInt32(reader["Confianca"]),
                gravidadeNivel = Convert.ToInt32(reader["GravidadeNivel"]),
                gravidade = reader["Gravidade"]?.ToString(),
                sintomasObservados = reader["SintomasObservados"]?.ToString(),
                tratamentoEcologico = reader["TratamentoEcologico"]?.ToString(),
                tratamentoQuimico = reader["TratamentoQuimico"]?.ToString(),
                prevencao = reader["Prevencao"]?.ToString(),
                riscoPropagacao = reader["RiscoPropagacao"]?.ToString(),
                riscoPropagacaoNivel = Convert.ToInt32(reader["RiscoPropagacaoNivel"]),
                plantasAfetadas = reader["PlantasAfetadas"]?.ToString(),
                condicoesFavoraveis = reader["CondicoesFavoraveis"]?.ToString(),
                tratamentoPasso1 = reader["Tratamento"]?.ToString(),
                recomendacaoUrgencia = "em 48h",
                diasParaAcao = 2
            };
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
            return await ChamarGemini(system, userText, base64!, mime!, "diagnosticar",
                UsuarioIdAtual, HttpContext.Connection.RemoteIpAddress?.ToString() ?? "");
        }

        // ── Diagnóstico via JSON/base64 (frontend) ───────────────

        [HttpPost("diagnosticar")]
        public async Task<IActionResult> Diagnosticar([FromBody] AnaliseRequest req)
        {
            if (string.IsNullOrWhiteSpace(req.ImagemBase64))
                return BadRequest(new { erro = "ImagemBase64 e obrigatorio." });

            // ── MODO OFFLINE / DEMO ─────────────────────────────
            var demo = BuscarDiagnosticoDemo(req);

            if (demo != null)
            {
                return Ok(demo);
            }

            // ── IA REAL ─────────────────────────────────────────
            var (system, userText) = PromptService.MontarPromptDiagnostico(req);

            return await ChamarGemini(
                system,
                userText,
                req.ImagemBase64,
                req.MimeType ?? "image/jpeg",
                "diagnosticar",
                UsuarioIdAtual,
                HttpContext.Connection.RemoteIpAddress?.ToString() ?? ""
            );
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
            return await ChamarGemini(system, userText, base64!, mime!, "identificar",
                UsuarioIdAtual, HttpContext.Connection.RemoteIpAddress?.ToString() ?? "");
        }

        // ── Identificação via JSON/base64 (frontend) ─────────────

        [HttpPost("identificar")]
        public async Task<IActionResult> Identificar([FromBody] AnaliseRequest req)
        {
            if (string.IsNullOrWhiteSpace(req.ImagemBase64))
                return BadRequest(new { erro = "ImagemBase64 e obrigatorio." });

            var (system, userText) = PromptService.MontarPromptIdentificacao(req);
            return await ChamarGemini(system, userText, req.ImagemBase64,
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


        // ── Dashboard (visão geral) ────────────────────────────────

        [HttpGet("dashboard")]
        public IActionResult Dashboard()
        {
            try
            {
                using var conn = new SqlConnection(ConnStr);
                conn.Open();

                int diagnosticosHoje = 0, diagnosticosOntem = 0;
                int totalUltimos30 = 0, totalBaixaUltimos30 = 0;
                int alertasAtivos30d = 0, alertasCriticos7d = 0;
                double confiancaMedia30d = 0, confiancaMediaAnterior30d = 0;

                const string sqlKpis = @"
            SELECT
              (SELECT COUNT(*) FROM Diagnosticos WHERE UsuarioId=@uid AND CAST(DataDiagnostico AS DATE) = CAST(GETDATE() AS DATE)) AS Hoje,
              (SELECT COUNT(*) FROM Diagnosticos WHERE UsuarioId=@uid AND CAST(DataDiagnostico AS DATE) = CAST(DATEADD(DAY,-1,GETDATE()) AS DATE)) AS Ontem,
              (SELECT COUNT(*) FROM Diagnosticos WHERE UsuarioId=@uid AND DataDiagnostico >= DATEADD(DAY,-30,GETDATE())) AS Total30,
              (SELECT COUNT(*) FROM Diagnosticos WHERE UsuarioId=@uid AND DataDiagnostico >= DATEADD(DAY,-30,GETDATE()) AND Gravidade='baixa') AS Baixa30,
              (SELECT COUNT(*) FROM Diagnosticos WHERE UsuarioId=@uid AND DataDiagnostico >= DATEADD(DAY,-30,GETDATE()) AND Gravidade='alta') AS Alertas30,
              (SELECT COUNT(*) FROM Diagnosticos WHERE UsuarioId=@uid AND DataDiagnostico >= DATEADD(DAY,-7,GETDATE()) AND GravidadeNivel >= 8) AS Criticos7,
              (SELECT AVG(CAST(Confianca AS FLOAT)) FROM Diagnosticos WHERE UsuarioId=@uid AND DataDiagnostico >= DATEADD(DAY,-30,GETDATE())) AS ConfMedia30,
              (SELECT AVG(CAST(Confianca AS FLOAT)) FROM Diagnosticos WHERE UsuarioId=@uid AND DataDiagnostico >= DATEADD(DAY,-60,GETDATE()) AND DataDiagnostico < DATEADD(DAY,-30,GETDATE())) AS ConfMediaAnt";

                using (var cmd = new SqlCommand(sqlKpis, conn))
                {
                    cmd.Parameters.AddWithValue("@uid", UsuarioIdAtual);
                    using var r = cmd.ExecuteReader();
                    if (r.Read())
                    {
                        diagnosticosHoje = r["Hoje"] == DBNull.Value ? 0 : (int)r["Hoje"];
                        diagnosticosOntem = r["Ontem"] == DBNull.Value ? 0 : (int)r["Ontem"];
                        totalUltimos30 = r["Total30"] == DBNull.Value ? 0 : (int)r["Total30"];
                        totalBaixaUltimos30 = r["Baixa30"] == DBNull.Value ? 0 : (int)r["Baixa30"];
                        alertasAtivos30d = r["Alertas30"] == DBNull.Value ? 0 : (int)r["Alertas30"];
                        alertasCriticos7d = r["Criticos7"] == DBNull.Value ? 0 : (int)r["Criticos7"];
                        confiancaMedia30d = r["ConfMedia30"] == DBNull.Value ? 0 : (double)r["ConfMedia30"];
                        confiancaMediaAnterior30d = r["ConfMediaAnt"] == DBNull.Value ? 0 : (double)r["ConfMediaAnt"];
                    }
                }

                double VarPct(double atual, double anterior) =>
                    anterior == 0 ? 0 : Math.Round(((atual - anterior) / anterior) * 100, 1);

                var kpis = new
                {
                    diagnosticosHoje,
                    diagnosticosHojeVariacaoPct = VarPct(diagnosticosHoje, diagnosticosOntem),
                    percentualSaudavel = totalUltimos30 == 0 ? 0 : Math.Round((double)totalBaixaUltimos30 / totalUltimos30 * 100, 1),
                    totalUltimos30,
                    alertasAtivos30d,
                    alertasCriticos7d,
                    confiancaMedia = Math.Round(confiancaMedia30d, 1),
                    confiancaMediaVariacaoPct = VarPct(confiancaMedia30d, confiancaMediaAnterior30d)
                };

                // Série semanal (últimos 7 dias)
                var semanal = new List<object>();
                const string sqlSemana = @"
            SELECT CAST(DataDiagnostico AS DATE) AS Dia,
                   SUM(CASE WHEN Gravidade = 'baixa' THEN 1 ELSE 0 END) AS Saudaveis,
                   SUM(CASE WHEN Gravidade IN ('media','alta') THEN 1 ELSE 0 END) AS Alertas
            FROM Diagnosticos
            WHERE UsuarioId=@uid AND DataDiagnostico >= DATEADD(DAY,-6,CAST(GETDATE() AS DATE))
            GROUP BY CAST(DataDiagnostico AS DATE)
            ORDER BY Dia";
                using (var cmd = new SqlCommand(sqlSemana, conn))
                {
                    cmd.Parameters.AddWithValue("@uid", UsuarioIdAtual);
                    using var r = cmd.ExecuteReader();
                    while (r.Read())
                        semanal.Add(new
                        {
                            dia = ((DateTime)r["Dia"]).ToString("yyyy-MM-dd"),
                            saudaveis = (int)r["Saudaveis"],
                            alertas = (int)r["Alertas"]
                        });
                }

                // Distribuição por cultura
                var distribuicao = new List<object>();
                const string sqlCultura = @"
            SELECT ISNULL(h.NomePopular, 'Não identificado') AS Cultura, COUNT(*) AS Total
            FROM Diagnosticos d
            LEFT JOIN Hortalicas h ON h.HortalicaId = d.HortalicaId
            WHERE d.UsuarioId=@uid
            GROUP BY h.NomePopular
            ORDER BY Total DESC";
                using (var cmd = new SqlCommand(sqlCultura, conn))
                {
                    cmd.Parameters.AddWithValue("@uid", UsuarioIdAtual);
                    using var r = cmd.ExecuteReader();
                    var temp = new List<(string cultura, int total)>();
                    int totalGeral = 0;
                    while (r.Read())
                    {
                        var c = r["Cultura"].ToString()!;
                        var t = (int)r["Total"];
                        temp.Add((c, t));
                        totalGeral += t;
                    }
                    foreach (var (cultura, total) in temp)
                        distribuicao.Add(new
                        {
                            cultura,
                            total,
                            percentual = totalGeral == 0 ? 0 : Math.Round((double)total / totalGeral * 100, 1)
                        });
                }

                // Diagnósticos recentes (tabela)
                var recentes = new List<object>();
                const string sqlRecentes = @"
            SELECT TOP 8 d.DiagnosticoId, ISNULL(h.NomePopular,'—') AS Cultura,
                   d.NomeDoenca, d.Gravidade, d.Confianca, d.DataDiagnostico
            FROM Diagnosticos d
            LEFT JOIN Hortalicas h ON h.HortalicaId = d.HortalicaId
            WHERE d.UsuarioId=@uid
            ORDER BY d.DataDiagnostico DESC";
                using (var cmd = new SqlCommand(sqlRecentes, conn))
                {
                    cmd.Parameters.AddWithValue("@uid", UsuarioIdAtual);
                    using var r = cmd.ExecuteReader();
                    while (r.Read())
                        recentes.Add(new
                        {
                            id = (int)r["DiagnosticoId"],
                            cultura = r["Cultura"].ToString(),
                            diagnostico = r["NomeDoenca"] == DBNull.Value ? "—" : r["NomeDoenca"].ToString(),
                            severidade = r["Gravidade"] == DBNull.Value ? "—" : r["Gravidade"].ToString(),
                            confianca = r["Confianca"] == DBNull.Value ? 0 : (int)r["Confianca"],
                            data = ((DateTime)r["DataDiagnostico"]).ToString("dd/MM/yyyy HH:mm")
                        });
                }

                // Alertas críticos (top 3, gravidade alta)
                var alertasCriticos = new List<object>();
                const string sqlAlertas = @"
            SELECT TOP 3 d.NomeDoenca, ISNULL(h.NomePopular,'Cultura não identificada') AS Cultura, d.GravidadeNivel
            FROM Diagnosticos d
            LEFT JOIN Hortalicas h ON h.HortalicaId = d.HortalicaId
            WHERE d.UsuarioId=@uid AND d.Gravidade='alta'
            ORDER BY d.DataDiagnostico DESC";
                using (var cmd = new SqlCommand(sqlAlertas, conn))
                {
                    cmd.Parameters.AddWithValue("@uid", UsuarioIdAtual);
                    using var r = cmd.ExecuteReader();
                    while (r.Read())
                        alertasCriticos.Add(new
                        {
                            titulo = r["NomeDoenca"] == DBNull.Value ? "Alerta" : r["NomeDoenca"].ToString(),
                            subtitulo = r["Cultura"].ToString(),
                            nivel = r["GravidadeNivel"] == DBNull.Value ? 0 : (int)r["GravidadeNivel"]
                        });
                }

                // Distribuição por severidade (gráfico de barras inferior)
                var severidade = new List<object>();
                const string sqlSeveridade = @"
            SELECT ISNULL(Gravidade,'não definida') AS Gravidade, COUNT(*) AS Total
            FROM Diagnosticos
            WHERE UsuarioId=@uid
            GROUP BY Gravidade";
                using (var cmd = new SqlCommand(sqlSeveridade, conn))
                {
                    cmd.Parameters.AddWithValue("@uid", UsuarioIdAtual);
                    using var r = cmd.ExecuteReader();
                    while (r.Read())
                        severidade.Add(new
                        {
                            nivel = r["Gravidade"].ToString(),
                            total = (int)r["Total"]
                        });
                }

                return Ok(new { kpis, semanal, distribuicao, recentes, alertasCriticos, severidade });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Erro ao montar dashboard.");
                return StatusCode(500, new { erro = "Erro ao montar dashboard.", detalhe = ex.Message });
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


        private async Task<IActionResult> ChamarGemini(
    string systemPrompt,
    string userText,
    string imagemBase64,
    string mimeType,
    string acao,
    int usuarioId,
    string ip)
        {
            var apiKey = _config["Gemini:ApiKey"];
            var model = _config["Gemini:Model"] ?? "gemini-2.0-flash";

            if (string.IsNullOrWhiteSpace(apiKey))
                return StatusCode(500, new { erro = "Gemini:ApiKey nao configurada no appsettings.json." });

            try
            {
                var parts = new List<object>
        {
            new { text = userText },
            new {
                inline_data = new {
                    mime_type = mimeType,
                    data      = imagemBase64
                }
            }
        };

                var payload = JsonSerializer.Serialize(new
                {
                    system_instruction = new { parts = new[] { new { text = systemPrompt } } },
                    contents = new[]
                    {
                new { role = "user", parts }
            },
                    generationConfig = new
                    {
                        temperature = 0.2,
                        maxOutputTokens = 1500
                    }
                });

                var url = $"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={apiKey}";

                // ── Retry com backoff exponencial para erros transitórios ──
                // 503 (UNAVAILABLE / alta demanda) e 429 (RESOURCE_EXHAUSTED)
                // costumam se resolver sozinhos em poucos segundos.
                const int maxTentativas = 3;
                var delays = new[] { 1000, 2000, 4000 }; // ms

                HttpResponseMessage resp = null!;
                string raw = "";

                for (int tentativa = 1; tentativa <= maxTentativas; tentativa++)
                {
                    using var httpReq = new HttpRequestMessage(HttpMethod.Post, url);
                    httpReq.Content = new StringContent(payload, Encoding.UTF8, "application/json");

                    resp = await _http.SendAsync(httpReq);
                    raw = await resp.Content.ReadAsStringAsync();

                    bool transitorio = resp.StatusCode == System.Net.HttpStatusCode.ServiceUnavailable
                        || resp.StatusCode == System.Net.HttpStatusCode.TooManyRequests
                        || (int)resp.StatusCode >= 500;

                    if (resp.IsSuccessStatusCode || !transitorio)
                        break;

                    _logger.LogWarning(
                        "Gemini indisponivel (tentativa {Tentativa}/{Max}, HTTP {Status}). Tentando novamente em {Delay}ms.",
                        tentativa, maxTentativas, (int)resp.StatusCode, delays[tentativa - 1]);

                    if (tentativa < maxTentativas)
                        await Task.Delay(delays[tentativa - 1]);
                }

                if (!resp.IsSuccessStatusCode)
                {
                    _logger.LogError("Gemini {Status} apos {Tentativas} tentativas: {Body}", (int)resp.StatusCode, maxTentativas, raw);

                    bool eraTransitorio = resp.StatusCode == System.Net.HttpStatusCode.ServiceUnavailable
                        || resp.StatusCode == System.Net.HttpStatusCode.TooManyRequests;

                    var msgAmigavel = eraTransitorio
                        ? "O serviço de IA está sobrecarregado no momento. Já tentamos algumas vezes automaticamente, mas ainda assim não conseguimos. Aguarde alguns instantes e tente novamente."
                        : $"Erro na API Gemini (HTTP {(int)resp.StatusCode}).";

                    return StatusCode((int)resp.StatusCode, new
                    {
                        erro = msgAmigavel,
                        detalhe = raw,
                        transitorio = eraTransitorio
                    });
                }

                _ = Task.Run(() => RegistrarAudit(acao, model, raw, usuarioId, ip, ConnStr));

                using var doc = JsonDocument.Parse(raw);
                var text = doc.RootElement
                    .GetProperty("candidates")[0]
                    .GetProperty("content")
                    .GetProperty("parts")[0]
                    .GetProperty("text")
                    .GetString() ?? "{}";

                text = text.Replace("```json", "").Replace("```", "").Trim();
                text = PromptService.ExpandirAliases(text);
                var start = text.IndexOf('{');
                var end = text.LastIndexOf('}');
                if (start >= 0 && end > start)
                    text = text[start..(end + 1)];

                try { return Ok(JsonDocument.Parse(text).RootElement); }
                catch { return Ok(new { raw = text, aviso = "Resposta fora do formato JSON esperado." }); }
            }
            catch (HttpRequestException ex)
            {
                return StatusCode(503, new { erro = "Falha na comunicacao com o Gemini.", detalhe = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Erro interno ao chamar Gemini.");
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
                if (doc.RootElement.TryGetProperty("usageMetadata", out var usage) &&
                usage.TryGetProperty("totalTokenCount", out var t))
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