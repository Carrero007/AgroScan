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
        // Não hospeda nenhum arquivo: monta um resumo completo do diagnóstico
        // em texto, e orienta a pessoa a pedir o PDF por e-mail dentro do
        // próprio sistema caso queira o relatório completo.
        [HttpPost("link-whatsapp")]
        public IActionResult GerarLinkWhatsapp([FromBody] GerarLinkRequest req)
        {
            var d = BuscarDiagnosticoDoUsuario(req.DiagnosticoId);
            if (d == null) return NotFound(new { erro = "Diagnostico nao encontrado." });

            try
            {
                var linhas = new List<string>
                {
                    "🌱 *AgroScan — Relatório de Diagnóstico*",
                    "",
                    $"*Hortaliça:* {d.HortalicaNome ?? "—"}",
                    $"*Diagnóstico:* {d.NomeDoenca ?? "—"}",
                };

                if (!string.IsNullOrWhiteSpace(d.NomeCientifico))
                    linhas.Add($"_{d.NomeCientifico}_");

                linhas.Add($"*Tipo:* {d.TipoDiagnostico ?? "—"}");
                linhas.Add($"*Gravidade:* {TraduzGravidade(d.Gravidade)}");
                linhas.Add($"*Risco de propagação:* {TraduzRisco(d.RiscoPropagacao)}");
                linhas.Add($"*Confiança da IA:* {d.Confianca}%");
                linhas.Add("");

                if (!string.IsNullOrWhiteSpace(d.SintomasObservados))
                {
                    linhas.Add("🔍 *Sintomas observados:*");
                    linhas.Add(d.SintomasObservados);
                    linhas.Add("");
                }

                if (!string.IsNullOrWhiteSpace(d.TratamentoEcologico))
                {
                    linhas.Add("🌿 *Tratamento ecológico:*");
                    linhas.Add(d.TratamentoEcologico);
                    linhas.Add("");
                }

                if (!string.IsNullOrWhiteSpace(d.Prevencao))
                {
                    linhas.Add("🛡️ *Prevenção:*");
                    linhas.Add(d.Prevencao);
                    linhas.Add("");
                }

                linhas.Add($"📅 Diagnóstico feito em {d.DataDiagnostico:dd/MM/yyyy HH:mm}");
                linhas.Add("");
                linhas.Add("📄 _Quer o relatório completo em PDF? Peça o envio por e-mail direto no sistema AgroScan._");

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