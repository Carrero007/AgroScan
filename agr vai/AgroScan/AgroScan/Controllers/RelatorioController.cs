using AgroScan.Models;
using AgroScan.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;

namespace AgroScan.Controllers
{
    [ApiController]
    [Route("api/relatorio")]
    [Authorize]
    public class RelatorioController : ControllerBase
    {
        private readonly IConfiguration _config;
        private readonly BrevoService _brevo;
        private readonly ILogger<RelatorioController> _logger;
        private string ConnStr => _config.GetConnectionString("DefaultConnection")!;

        public RelatorioController(IConfiguration config, BrevoService brevo, ILogger<RelatorioController> logger)
        {
            _config = config;
            _brevo = brevo;
            _logger = logger;
        }

        private int UsuarioIdAtual =>
            int.TryParse(User.FindFirst("sub")?.Value, out var id) ? id : 0;

        private Diagnostico? BuscarDiagnosticoDoUsuario(int diagnosticoId)
        {
            using var conn = new SqlConnection(ConnStr);
            const string sql = @"
                SELECT d.*, h.NomePopular AS HortalicaNome
                FROM Diagnosticos d
                LEFT JOIN Hortalicas h ON h.HortalicaId = d.HortalicaId
                WHERE d.DiagnosticoId = @id AND d.UsuarioId = @uid";
            using var cmd = new SqlCommand(sql, conn);
            cmd.Parameters.AddWithValue("@id", diagnosticoId);
            cmd.Parameters.AddWithValue("@uid", UsuarioIdAtual);
            conn.Open();
            using var r = cmd.ExecuteReader();
            if (!r.Read()) return null;

            return new Diagnostico
            {
                DiagnosticoId = (int)r["DiagnosticoId"],
                HortalicaNome = r["HortalicaNome"] == DBNull.Value ? null : r["HortalicaNome"].ToString(),
                TipoDiagnostico = r["TipoDiagnostico"] as string,
                NomeDoenca = r["NomeDoenca"] as string,
                NomeCientifico = r["NomeCientifico"] as string,
                AgenteCausador = r["AgenteCausador"] as string,
                Confianca = r["Confianca"] == DBNull.Value ? 0 : (int)r["Confianca"],
                GravidadeNivel = r["GravidadeNivel"] == DBNull.Value ? 0 : (int)r["GravidadeNivel"],
                Gravidade = r["Gravidade"] as string,
                SintomasObservados = r["SintomasObservados"] as string,
                TratamentoEcologico = r["TratamentoEcologico"] as string,
                TratamentoQuimico = r["TratamentoQuimico"] as string,
                Prevencao = r["Prevencao"] as string,
                RiscoPropagacao = r["RiscoPropagacao"] as string,
                PlantasAfetadas = r["PlantasAfetadas"] as string,
                DataDiagnostico = (DateTime)r["DataDiagnostico"]
            };
        }

        private string ObterNomeUsuario()
        {
            using var conn = new SqlConnection(ConnStr);
            using var cmd = new SqlCommand("SELECT Nome FROM Usuarios WHERE UsuarioId=@id", conn);
            cmd.Parameters.AddWithValue("@id", UsuarioIdAtual);
            conn.Open();
            return cmd.ExecuteScalar()?.ToString() ?? "Produtor";
        }

        private static string TraduzGravidade(string? g) =>
            g switch { "alta" => "Alta 🔴", "media" => "Média 🟡", "baixa" => "Baixa 🟢", _ => "—" };

        private static string TraduzRisco(string? r) =>
            r switch { "alto" => "Alto", "medio" => "Médio", "baixo" => "Baixo", _ => "—" };

        // ── ENVIAR POR E-MAIL (Brevo, com PDF anexado) ────────────
        [HttpPost("enviar-email")]
        public async Task<IActionResult> EnviarEmail([FromBody] EnviarEmailRequest req)
        {
            if (string.IsNullOrWhiteSpace(req.Email) || !req.Email.Contains('@'))
                return BadRequest(new { erro = "E-mail invalido." });

            var d = BuscarDiagnosticoDoUsuario(req.DiagnosticoId);
            if (d == null) return NotFound(new { erro = "Diagnostico nao encontrado." });

            var nomeUsuario = ObterNomeUsuario();
            var pdfBytes = PdfService.GerarPdfDiagnostico(d, nomeUsuario);
            var nomeArquivo = $"agroscan-diagnostico-{d.DiagnosticoId}.pdf";

            var assunto = $"AgroScan — Diagnóstico: {d.NomeDoenca ?? "Relatório"}";
            var corpoHtml = $@"
                <p>Olá!</p>
                <p>Segue em anexo o relatório de diagnóstico gerado pelo AgroScan para <strong>{d.NomeDoenca ?? "sua hortaliça"}</strong>.</p>
                <p>Produtor: {nomeUsuario}<br/>Data: {d.DataDiagnostico:dd/MM/yyyy HH:mm}</p>
                <p style=""color:#999;font-size:12px"">E-mail automático enviado pelo sistema AgroScan.</p>";

            var (sucesso, erro) = await _brevo.EnviarPdfPorEmailAsync(req.Email, assunto, corpoHtml, pdfBytes, nomeArquivo);

            if (!sucesso)
                return StatusCode(502, new { erro = erro ?? "Falha ao enviar e-mail." });

            return Ok(new { sucesso = true, mensagem = $"Relatório enviado para {req.Email}." });
        }

        // ── GERAR MENSAGEM PARA WHATSAPP (texto informativo, sem PDF) ──
        // Mensagem enxuta e legível: título curto, uma linha de resumo
        // (hortaliça · gravidade · confiança) e só as seções que existem
        // de fato (sem "Risco de propagação: —" nem blocos vazios).
        // Não hospeda nenhum arquivo: orienta a pedir o PDF completo pelo
        // sistema caso o produtor queira o relatório detalhado.
        [HttpPost("link-whatsapp")]
        public IActionResult GerarLinkWhatsapp([FromBody] GerarLinkRequest req)
        {
            var d = BuscarDiagnosticoDoUsuario(req.DiagnosticoId);
            if (d == null) return NotFound(new { erro = "Diagnostico nao encontrado." });

            try
            {
                var linhas = new List<string>
                {
                    "🌱 *AgroScan* — Diagnóstico",
                    "",
                    $"*{d.NomeDoenca ?? "Diagnóstico"}*" +
                        (!string.IsNullOrWhiteSpace(d.NomeCientifico) ? $" _({d.NomeCientifico})_" : ""),
                    $"{d.HortalicaNome ?? "Hortaliça"} · {TraduzGravidade(d.Gravidade)} · {d.Confianca}% de confiança",
                    ""
                };

                if (!string.IsNullOrWhiteSpace(d.SintomasObservados))
                    linhas.Add($"🔍 *Sintomas:* {d.SintomasObservados}");

                // Prioriza o tratamento ecológico (mais aplicável no dia a dia);
                // só cai pro químico se o ecológico não existir.
                var tratamento = !string.IsNullOrWhiteSpace(d.TratamentoEcologico)
                    ? d.TratamentoEcologico
                    : d.TratamentoQuimico;
                if (!string.IsNullOrWhiteSpace(tratamento))
                    linhas.Add($"🌿 *Tratamento:* {tratamento}");

                if (!string.IsNullOrWhiteSpace(d.Prevencao))
                    linhas.Add($"🛡️ *Prevenção:* {d.Prevencao}");

                if (!string.IsNullOrWhiteSpace(d.RiscoPropagacao))
                    linhas.Add($"⚠️ *Risco de propagação:* {TraduzRisco(d.RiscoPropagacao)}");

                linhas.Add("");
                linhas.Add($"📅 {d.DataDiagnostico:dd/MM/yyyy} · relatório completo em PDF pelo AgroScan");

                var texto = string.Join("\n", linhas);
                var textoCodificado = Uri.EscapeDataString(texto);

                var numero = (req.NumeroWhatsapp ?? "").Where(char.IsDigit).ToArray();
                var numeroLimpo = new string(numero);

                var linkWhatsapp = string.IsNullOrWhiteSpace(numeroLimpo)
                    ? $"https://wa.me/?text={textoCodificado}"
                    : $"https://wa.me/{numeroLimpo}?text={textoCodificado}";

                return Ok(new { sucesso = true, linkWhatsapp });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Erro ao gerar mensagem de whatsapp.");
                return StatusCode(500, new { erro = "Erro ao gerar mensagem para envio.", detalhe = ex.Message });
            }
        }
    }

    public class EnviarEmailRequest
    {
        public int DiagnosticoId { get; set; }
        public string Email { get; set; } = string.Empty;
    }

    public class GerarLinkRequest
    {
        public int DiagnosticoId { get; set; }
        /// <summary>Número no formato internacional só com dígitos, ex: 5511999998888. Opcional — se vazio, abre o seletor de contato do WhatsApp.</summary>
        public string? NumeroWhatsapp { get; set; }
    }
}