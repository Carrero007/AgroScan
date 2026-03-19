using AgroScan.Models;
using Microsoft.AspNetCore.Identity.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;

namespace AgroScan.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class LoginController : ControllerBase
    {
        private readonly ILogger<LoginController> _logger;

        private const string ConnectionString =
            "Data Source=(localdb)\\MSSQLLocalDB;Initial Catalog=AgroScan;Integrated Security=True;Connect Timeout=30;Encrypt=False;Trust Server Certificate=False;Application Intent=ReadWrite;Multi Subnet Failover=False";

        public LoginController(ILogger<LoginController> logger)
        {
            _logger = logger;
        }

        // POST api/login
        [HttpPost]
        public ActionResult<object> ValidarLogin([FromBody] Login login)
        {
            if (string.IsNullOrWhiteSpace(login.CPF) || string.IsNullOrWhiteSpace(login.Senha))
                return BadRequest("CPF e Senha são obrigatórios.");

            try
            {
                using var connection = new SqlConnection(ConnectionString);
                const string query = "SELECT Nome FROM [dbo].[Login] WHERE CPF = @CPF AND Senha = @Senha";

                using var command = new SqlCommand(query, connection);
                command.Parameters.AddWithValue("@CPF", login.CPF.Trim());
                command.Parameters.AddWithValue("@Senha", login.Senha);

                connection.Open();
                using var reader = command.ExecuteReader();

                if (reader.Read())
                    return Ok(new { nome = reader["Nome"].ToString() });

                return Unauthorized("CPF ou senha inválidos.");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Erro ao validar login.");
                return StatusCode(500, "Erro interno.");
            }
        }

        // POST api/login/cadastrar
        [HttpPost("cadastrar")]
        public ActionResult Cadastrar([FromBody] Cadastro usuario)
        {
            if (string.IsNullOrWhiteSpace(usuario.Nome) || usuario.Nome.Trim().Length < 3)
                return BadRequest("Nome inválido (mínimo 3 caracteres).");

            if (string.IsNullOrWhiteSpace(usuario.CPF) || usuario.CPF.Trim().Length != 11 || !usuario.CPF.All(char.IsDigit))
                return BadRequest("CPF deve conter exatamente 11 dígitos numéricos.");

            if (string.IsNullOrWhiteSpace(usuario.Senha) || usuario.Senha.Length < 4)
                return BadRequest("Senha muito curta (mínimo 4 caracteres).");

            try
            {
                using var connection = new SqlConnection(ConnectionString);
                const string query = @"
                    INSERT INTO [dbo].[Login] (CPF, Senha, Nome, Whatsapp, Latitude, Longitude)
                    VALUES (@CPF, @Senha, @Nome, @Whatsapp, @Latitude, @Longitude)";

                using var command = new SqlCommand(query, connection);
                command.Parameters.AddWithValue("@CPF", usuario.CPF.Trim());
                command.Parameters.AddWithValue("@Senha", usuario.Senha);
                command.Parameters.AddWithValue("@Nome", usuario.Nome.Trim());
                command.Parameters.AddWithValue("@Whatsapp", (object?)usuario.Whatsapp ?? DBNull.Value);
                command.Parameters.AddWithValue("@Latitude", (object?)usuario.Latitude ?? DBNull.Value);
                command.Parameters.AddWithValue("@Longitude", (object?)usuario.Longitude ?? DBNull.Value);

                connection.Open();
                command.ExecuteNonQuery();

                return Ok(new { sucesso = true });
            }
            catch (SqlException ex) when (ex.Number == 2627 || ex.Number == 2601)
            {
                return Conflict("Este CPF já está cadastrado.");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Erro ao cadastrar usuário.");
                return StatusCode(500, "Erro interno no servidor.");
            }
        }
    }
}