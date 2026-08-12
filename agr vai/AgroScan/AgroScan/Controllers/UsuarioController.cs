using AgroScan.Models;
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
        private string ConnStr => _config.GetConnectionString("DefaultConnection")!;

        public UsuarioController(IConfiguration config) => _config = config;

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
                // se CEP mudou, revalida via ViaCEP antes de gravar cidade/estado
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
    }

    public class AtualizarUsuarioRequest
    {
        public string Nome { get; set; } = string.Empty;
        public string Cep { get; set; } = string.Empty;
        public string? Cidade { get; set; }
        public string? Estado { get; set; }
    }
}