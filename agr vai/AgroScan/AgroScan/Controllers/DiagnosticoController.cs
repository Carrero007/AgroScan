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

            try
            {
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
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Modo demo indisponivel (SQL); usando Gemini.");
                return null;
            }
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

        // ── Salvar hortaliça identificada pela IA no catálogo ─────
        // Endpoint que faltava: identificar.js chamava isto e recebia 404
        // porque só existia um HortalicaController de plantio, sem esta rota.
        // Evita duplicata verificando NomeCientifico (case-insensitive).
        [HttpPost("salvar-hortalica")]
        public IActionResult SalvarHortalica([FromBody] SalvarHortalicaRequest req)
        {
            if (string.IsNullOrWhiteSpace(req.NomeCientifico))
                return BadRequest(new { erro = "NomeCientifico e obrigatorio." });

            try
            {
                using var conn = new SqlConnection(ConnStr);
                conn.Open();

                using (var check = new SqlCommand(
                    "SELECT COUNT(1) FROM Hortalicas WHERE LOWER(NomeCientifico) = LOWER(@nc)", conn))
                {
                    check.Parameters.AddWithValue("@nc", req.NomeCientifico);
                    var existe = (int)check.ExecuteScalar() > 0;
                    if (existe) return Ok(new { sucesso = true, jaExistia = true });
                }

                const string sql = @"
                    INSERT INTO Hortalicas
                        (NomeCientifico, NomePopular, Familia, Categoria, CicloVida,
                         DiasGerminacao, DiasColheita, Espacamento, Clima, Luminosidade,
                         Irrigacao, TipoSolo, Adubacao, PragasPrincipais, DoencasPrincipais,
                         Origem, ValorNutricional, Observacoes)
                    VALUES
                        (@nc, @np, @fam, @cat, @ciclo, @dg, @dc, @esp, @clima, @lum,
                         @irr, @solo, @adu, @pragas, @doencas, @origem, @valorNutri, @obs)";
                using var cmd = new SqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("@nc", req.NomeCientifico);
                cmd.Parameters.AddWithValue("@np", (object?)req.NomePopular ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@fam", (object?)req.Familia ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@cat", (object?)req.Categoria ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@ciclo", (object?)req.CicloVida ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@dg", (object?)req.DiasGerminacao ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@dc", (object?)req.DiasColheita ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@esp", (object?)req.Espacamento ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@clima", (object?)req.Clima ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@lum", (object?)req.Luminosidade ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@irr", (object?)req.Irrigacao ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@solo", (object?)req.TipoSolo ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@adu", (object?)req.Adubacao ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@pragas", (object?)req.PragasPrincipais ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@doencas", (object?)req.DoencasPrincipais ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@origem", (object?)req.Origem ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@valorNutri", (object?)req.ValorNutricional ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@obs", (object?)req.Observacoes ?? DBNull.Value);
                cmd.ExecuteNonQuery();

                return Ok(new { sucesso = true, jaExistia = false });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Erro ao salvar hortalica identificada.");
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
        // Aceita ?dias=7|30|90 para o seletor de período do dashboard.
        [HttpGet("dashboard")]
        public IActionResult Dashboard([FromQuery] int dias = 30)
        {
            if (dias is < 1 or > 365) dias = 30;

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
              (SELECT COUNT(*) FROM Diagnosticos WHERE UsuarioId=@uid AND DataDiagnostico >= DATEADD(DAY,-@dias,GETDATE())) AS Total30,
              (SELECT COUNT(*) FROM Diagnosticos WHERE UsuarioId=@uid AND DataDiagnostico >= DATEADD(DAY,-@dias,GETDATE()) AND Gravidade='baixa') AS Baixa30,
              (SELECT COUNT(*) FROM Diagnosticos WHERE UsuarioId=@uid AND DataDiagnostico >= DATEADD(DAY,-@dias,GETDATE()) AND Gravidade='alta') AS Alertas30,
              (SELECT COUNT(*) FROM Diagnosticos WHERE UsuarioId=@uid AND DataDiagnostico >= DATEADD(DAY,-7,GETDATE()) AND GravidadeNivel >= 8) AS Criticos7,
              (SELECT AVG(CAST(Confianca AS FLOAT)) FROM Diagnosticos WHERE UsuarioId=@uid AND DataDiagnostico >= DATEADD(DAY,-@dias,GETDATE())) AS ConfMedia30,
              (SELECT AVG(CAST(Confianca AS FLOAT)) FROM Diagnosticos WHERE UsuarioId=@uid AND DataDiagnostico >= DATEADD(DAY,-(@dias*2),GETDATE()) AND DataDiagnostico < DATEADD(DAY,-@dias,GETDATE())) AS ConfMediaAnt";

                using (var cmd = new SqlCommand(sqlKpis, conn))
                {
                    cmd.Parameters.AddWithValue("@uid", UsuarioIdAtual);
                    cmd.Parameters.AddWithValue("@dias", dias);
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

                var semanal = new List<object>();
                const string sqlSemana = @"
            SELECT CAST(DataDiagnostico AS DATE) AS Dia,
                   SUM(CASE WHEN Gravidade = 'baixa' THEN 1 ELSE 0 END) AS Saudaveis,
                   SUM(CASE WHEN Gravidade IN ('media','alta') THEN 1 ELSE 0 END) AS Alertas
            FROM Diagnosticos
            WHERE UsuarioId=@uid AND DataDiagnostico >= DATEADD(DAY,-@janela,CAST(GETDATE() AS DATE))
            GROUP BY CAST(DataDiagnostico AS DATE)
            ORDER BY Dia";
                using (var cmd = new SqlCommand(sqlSemana, conn))
                {
                    cmd.Parameters.AddWithValue("@uid", UsuarioIdAtual);
                    cmd.Parameters.AddWithValue("@janela", Math.Min(dias, 60) - 1);
                    using var r = cmd.ExecuteReader();
                    while (r.Read())
                        semanal.Add(new
                        {
                            dia = ((DateTime)r["Dia"]).ToString("yyyy-MM-dd"),
                            saudaveis = (int)r["Saudaveis"],
                            alertas = (int)r["Alertas"]
                        });
                }

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


        private static string NormalizarMimeType(string mime)
        {
            mime = (mime ?? "image/jpeg").Trim().ToLowerInvariant();
            return mime switch
            {
                "image/jpg" or "image/pjpeg" => "image/jpeg",
                "image/x-png" => "image/png",
                "image/jpeg" or "image/png" or "image/webp" => mime,
                _ => "image/jpeg"
            };
        }

        private static string ExtrairTextoRespostaGemini(JsonElement candidate)
        {
            if (!candidate.TryGetProperty("content", out var content)
                || !content.TryGetProperty("parts", out var parts))
                return "";

            var sb = new StringBuilder();
            foreach (var part in parts.EnumerateArray())
            {
                if (part.TryGetProperty("text", out var t))
                    sb.Append(t.GetString());
            }
            return sb.ToString();
        }

        private static string ExtrairJsonDiagnostico(string text)
        {
            text = text.Replace("```json", "", StringComparison.OrdinalIgnoreCase)
                       .Replace("```", "")
                       .Trim();
            text = PromptService.ExpandirAliases(text);

            var start = text.IndexOf('{');
            var end = text.LastIndexOf('}');
            if (start >= 0 && end > start)
                text = text[start..(end + 1)];

            return text;
        }

        private static string MontarPayloadGemini(string textoUsuario, string imagemBase64, string mimeType, bool jsonMode)
        {
            var generationConfig = jsonMode
                ? new { temperature = 0.2, maxOutputTokens = 8192, responseMimeType = "application/json" }
                : (object)new { temperature = 0.2, maxOutputTokens = 8192 };

            return JsonSerializer.Serialize(new
            {
                contents = new[]
                {
                    new
                    {
                        parts = new object[]
                        {
                            new { text = textoUsuario },
                            new
                            {
                                inlineData = new
                                {
                                    mimeType,
                                    data = imagemBase64
                                }
                            }
                        }
                    }
                },
                generationConfig
            });
        }
        private static string NormalizarImagemBase64(string base64)
        {
            if (string.IsNullOrWhiteSpace(base64))
                return base64;

            var s = base64.Trim();
            var comma = s.IndexOf(',');
            if (s.StartsWith("data:", StringComparison.OrdinalIgnoreCase) && comma >= 0)
                s = s[(comma + 1)..];

            return s.Replace("\r", "").Replace("\n", "").Replace(" ", "");
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
            var model = _config["Gemini:Model"] ?? "gemini-2.5-flash";

            if (string.IsNullOrWhiteSpace(apiKey))
                return StatusCode(500, new { erro = "Gemini:ApiKey nao configurada no appsettings.json." });

            try
            {
                imagemBase64 = NormalizarImagemBase64(imagemBase64);
                mimeType = NormalizarMimeType(mimeType);

                // Igual ao HTML de teste: texto + imagem na mesma mensagem (sem systemInstruction).
                var textoCompleto = $"{systemPrompt}\n\n{userText}";
                var url = $"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={apiKey}";

                const int maxTentativas = 3;
                var delays = new[] { 1000, 2000, 4000 };

                HttpResponseMessage resp = null!;
                string raw = "";
                var jsonMode = true;

                for (int tentativa = 1; tentativa <= maxTentativas; tentativa++)
                {
                    var payload = MontarPayloadGemini(textoCompleto, imagemBase64, mimeType, jsonMode);

                    using var httpReq = new HttpRequestMessage(HttpMethod.Post, url);
                    httpReq.Content = new StringContent(payload, Encoding.UTF8, "application/json");

                    resp = await _http.SendAsync(httpReq);
                    raw = await resp.Content.ReadAsStringAsync();

                    if (resp.StatusCode == System.Net.HttpStatusCode.BadRequest && jsonMode)
                    {
                        _logger.LogWarning("Gemini 400 com responseMimeType JSON; tentando modo texto. Body: {Body}", raw);
                        jsonMode = false;
                        continue;
                    }

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
                    _logger.LogError("Gemini {Status} apos tentativas: {Body}", (int)resp.StatusCode, raw);

                    var detalheErro = raw;
                    try
                    {
                        using var errDoc = JsonDocument.Parse(raw);
                        if (errDoc.RootElement.TryGetProperty("error", out var err)
                            && err.TryGetProperty("message", out var msg))
                            detalheErro = msg.GetString() ?? raw;
                    }
                    catch { /* mantém raw */ }

                    bool eraTransitorio = resp.StatusCode == System.Net.HttpStatusCode.ServiceUnavailable
                        || resp.StatusCode == System.Net.HttpStatusCode.TooManyRequests;

                    var msgAmigavel = eraTransitorio
                        ? "O serviço de IA está sobrecarregado no momento. Aguarde alguns instantes e tente novamente."
                        : $"Erro na API Gemini (HTTP {(int)resp.StatusCode}).";

                    return StatusCode((int)resp.StatusCode, new
                    {
                        erro = msgAmigavel,
                        detalhe = detalheErro,
                        transitorio = eraTransitorio
                    });
                }

                _ = Task.Run(() => RegistrarAudit(acao, model, raw, usuarioId, ip, ConnStr));

                using var doc = JsonDocument.Parse(raw);
                if (!doc.RootElement.TryGetProperty("candidates", out var candidates)
                    || candidates.GetArrayLength() == 0)
                {
                    return StatusCode(502, new
                    {
                        erro = "A API Gemini nao retornou candidatos para a analise.",
                        detalhe = raw
                    });
                }

                var candidate = candidates[0];
                var text = ExtrairTextoRespostaGemini(candidate);
                if (string.IsNullOrWhiteSpace(text))
                {
                    return StatusCode(502, new
                    {
                        erro = "A API Gemini nao retornou texto para a analise realizada.",
                        detalhe = raw
                    });
                }

                text = ExtrairJsonDiagnostico(text);

                try
                {
                    using var parsed = JsonDocument.Parse(text);
                    var root = parsed.RootElement;

                    // Schema de identificação (nomeCientifico/nomePopular) é diferente
                    // do de diagnóstico (tipoDiagnostico/nomeDoenca) — antes essa
                    // checagem só aceitava o schema de diagnóstico e derrubava
                    // toda chamada de "identificar" com 502.
                    bool valido = acao == "identificar"
                        ? root.TryGetProperty("nomeCientifico", out _) || root.TryGetProperty("nomePopular", out _)
                        : root.TryGetProperty("tipoDiagnostico", out _) || root.TryGetProperty("nomeDoenca", out _);

                    if (!valido)
                    {
                        return StatusCode(502, new
                        {
                            erro = "Resposta da IA incompleta ou fora do formato esperado.",
                            detalhe = text
                        });
                    }

                    return Content(text, "application/json");
                }
                catch (JsonException)
                {
                    return StatusCode(502, new
                    {
                        erro = "Nao foi possivel interpretar o JSON retornado pela IA.",
                        detalhe = text
                    });
                }
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