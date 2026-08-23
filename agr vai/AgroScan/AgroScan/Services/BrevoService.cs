using System.Text;
using System.Text.Json;

namespace AgroScan.Services
{
    /// <summary>
    /// Envio de e-mail transacional via API REST do Brevo (ex-Sendinblue).
    /// Documentação: https://developers.brevo.com/reference/sendtransacemail
    /// </summary>
    public class BrevoService
    {
        private readonly HttpClient _http;
        private readonly IConfiguration _config;
        private readonly ILogger<BrevoService> _logger;

        public BrevoService(IHttpClientFactory httpFactory, IConfiguration config, ILogger<BrevoService> logger)
        {
            _http = httpFactory.CreateClient();
            _config = config;
            _logger = logger;
        }

        public async Task<(bool sucesso, string? erro)> EnviarPdfPorEmailAsync(
            string emailDestino, string assunto, string corpoHtml, byte[] pdfBytes, string nomeArquivo)
        {
            var apiKey = _config["Brevo:ApiKey"];
            var remetenteEmail = _config["Brevo:RemetenteEmail"];
            var remetenteNome = _config["Brevo:RemetenteNome"] ?? "AgroScan";

            if (string.IsNullOrWhiteSpace(apiKey) || string.IsNullOrWhiteSpace(remetenteEmail))
                return (false, "Brevo nao configurado no servidor.");

            var payload = new
            {
                sender = new { email = remetenteEmail, name = remetenteNome },
                to = new[] { new { email = emailDestino } },
                subject = assunto,
                htmlContent = corpoHtml,
                attachment = new[]
                {
                    new { content = Convert.ToBase64String(pdfBytes), name = nomeArquivo }
                }
            };

            using var req = new HttpRequestMessage(HttpMethod.Post, "https://api.brevo.com/v3/smtp/email");
            req.Headers.Add("api-key", apiKey);
            req.Headers.Add("accept", "application/json");
            req.Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");

            try
            {
                var resp = await _http.SendAsync(req);
                if (resp.IsSuccessStatusCode) return (true, null);

                var body = await resp.Content.ReadAsStringAsync();
                _logger.LogError("Brevo retornou erro {Status}: {Body}", (int)resp.StatusCode, body);
                return (false, $"Falha ao enviar e-mail (HTTP {(int)resp.StatusCode}).");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Erro ao chamar API do Brevo.");
                return (false, "Erro de comunicacao com o servico de e-mail.");
            }
        }
    }
}