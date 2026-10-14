using AgroScan.Models;
using AgroScan.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;

namespace AgroScan.Controllers
{
    [ApiController]
    [Route("api/usuario")]
    [Authorize]
    public class UsuarioController : ControllerBase
    {
        private readonly IConfiguration _config;
        private readonly CryptoService _crypto;
        private readonly IHttpClientFactory _httpFactory;
        private string ConnStr => _config.GetConnectionString("DefaultConnection")!;

        public UsuarioController(IConfiguration config, CryptoService crypto, IHttpClientFactory httpFactory)
        {
            _config = config;
            _crypto = crypto;
            _httpFactory = httpFactory;
        }

        private int UsuarioIdAtual =>
            int.TryParse(User.FindFirst("sub")?.Value, out var id) ? id : 0;

        // GET api/usuario/me
        [HttpGet("me")]
        public IActionResult Me()
        {
            using var conn = new SqlConnection(ConnStr);
            const string sql = "SELECT UsuarioId, Nome, CPF, Cep, Cidade, Estado FROM Usuarios WHERE UsuarioId=@id";
            using var cmd = new SqlCommand(sql, conn);
            cmd.Parameters.AddWithValue("@id", UsuarioIdAtual);
            conn.Open();
            using var r = cmd.ExecuteReader();
            if (!r.Read()) return NotFound();

            return Ok(new
            {
                usuarioId = (int)r["UsuarioId"],
                nome = r["Nome"].ToString(),
                cpf = r["CPF"].ToString(),
                cep = r["Cep"]?.ToString(),
                cidade = r["Cidade"]?.ToString(),
                estado = r["Estado"]?.ToString()
            });
        }

        // PUT api/usuario/me  — só Nome e Cep são editáveis (CPF nunca muda)
        [HttpPut("me")]
        public IActionResult Atualizar([FromBody] AtualizarUsuarioRequest req)
        {
            if (string.IsNullOrWhiteSpace(req.Nome) || req.Nome.Trim().Length < 3)
                return BadRequest(new { erro = "Nome inválido (mínimo 3 caracteres)." });

            var cep = req.Cep?.Replace("-", "").Trim() ?? "";
            if (cep.Length != 8 || !cep.All(char.IsDigit))
                return BadRequest(new { erro = "CEP inválido." });

            try
            {
                using var conn = new SqlConnection(ConnStr);
                string cidade = req.Cidade ?? "", estado = req.Estado ?? "";

                const string sql = @"UPDATE Usuarios SET Nome=@nome, Cep=@cep, Cidade=@cidade, Estado=@estado
                                      WHERE UsuarioId=@id";
                using var cmd = new SqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("@nome", req.Nome.Trim());
                cmd.Parameters.AddWithValue("@cep", cep);
                cmd.Parameters.AddWithValue("@cidade", cidade);
                cmd.Parameters.AddWithValue("@estado", estado);
                cmd.Parameters.AddWithValue("@id", UsuarioIdAtual);
                conn.Open();
                cmd.ExecuteNonQuery();

                return Ok(new { sucesso = true, nome = req.Nome.Trim(), cep });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { erro = "Erro ao atualizar.", detalhe = ex.Message });
            }
        }

        // DELETE api/usuario/me — desativa a conta (soft delete)
        [HttpDelete("me")]
        public IActionResult Desativar()
        {
            using var conn = new SqlConnection(ConnStr);
            using var cmd = new SqlCommand("UPDATE Usuarios SET Ativo=0 WHERE UsuarioId=@id", conn);
            cmd.Parameters.AddWithValue("@id", UsuarioIdAtual);
            conn.Open();
            cmd.ExecuteNonQuery();
            return Ok(new { sucesso = true });
        }

        // GET api/usuario/gemini-key
        [HttpGet("gemini-key")]
        public IActionResult StatusChave()
        {
            using var conn = new SqlConnection(ConnStr);
            using var cmd = new SqlCommand("SELECT GeminiApiKeyEnc FROM Usuarios WHERE UsuarioId=@id", conn);
            cmd.Parameters.AddWithValue("@id", UsuarioIdAtual);
            conn.Open();
            var v = cmd.ExecuteScalar() as string;
            if (string.IsNullOrWhiteSpace(v)) return Ok(new { possui = false });
            string mascara = "••••";
            try { var k = _crypto.Decrypt(v); mascara = k[..4] + "••••••••" + k[^4..]; } catch { }
            return Ok(new { possui = true, mascara });
        }

        // PUT api/usuario/gemini-key
        [HttpPut("gemini-key")]
        public async Task<IActionResult> SalvarChave([FromBody] GeminiKeyRequest req)
        {
            var chave = (req.Chave ?? "").Trim();
            if (!chave.StartsWith("AIza") || chave.Length < 30 || chave.Length > 60 || chave.Any(char.IsWhiteSpace))
                return BadRequest(new { erro = "Chave inválida. Ela começa com \"AIza\" e não tem espaços." });

            try
            {
                var http = _httpFactory.CreateClient();
                http.Timeout = TimeSpan.FromSeconds(10);
                using var rq = new HttpRequestMessage(HttpMethod.Get,
                    "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1");
                rq.Headers.Add("x-goog-api-key", chave);
                var resp = await http.SendAsync(rq);
                if (resp.StatusCode is System.Net.HttpStatusCode.BadRequest or System.Net.HttpStatusCode.Forbidden)
                    return BadRequest(new { erro = "O Google recusou essa chave. Confira se copiou inteira." });
                if (!resp.IsSuccessStatusCode)
                    return StatusCode(502, new { erro = "Não foi possível validar a chave agora. Tente novamente." });

                using var conn = new SqlConnection(ConnStr);
                using var cmd = new SqlCommand("UPDATE Usuarios SET GeminiApiKeyEnc=@k WHERE UsuarioId=@id", conn);
                cmd.Parameters.AddWithValue("@k", _crypto.Encrypt(chave));
                cmd.Parameters.AddWithValue("@id", UsuarioIdAtual);
                conn.Open();
                cmd.ExecuteNonQuery();
                return Ok(new { sucesso = true });
            }
            catch (Exception)
            {
                return StatusCode(500, new { erro = "Erro ao salvar a chave." });
            }
        }

        // DELETE api/usuario/gemini-key
        [HttpDelete("gemini-key")]
        public IActionResult RemoverChave()
        {
            using var conn = new SqlConnection(ConnStr);
            using var cmd = new SqlCommand("UPDATE Usuarios SET GeminiApiKeyEnc=NULL WHERE UsuarioId=@id", conn);
            cmd.Parameters.AddWithValue("@id", UsuarioIdAtual);
            conn.Open();
            cmd.ExecuteNonQuery();
            return Ok(new { sucesso = true });
        }
    }

    public class AtualizarUsuarioRequest
    {
        public string Nome { get; set; } = string.Empty;
        public string Cep { get; set; } = string.Empty;
        public string? Cidade { get; set; }
        public string? Estado { get; set; }
    }

    public class GeminiKeyRequest { public string? Chave { get; set; } }
}