using AgroScan.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;

namespace AgroScan.Controllers
{
    [ApiController]
    [Route("Hortalica")]
    public class HortalicaController : Controller
    {
        private readonly ILogger<HortalicaController> _logger;
        private readonly IConfiguration _config;
        private string ConnStr => _config.GetConnectionString("DefaultConnection")!;
        public HortalicaController(ILogger<HortalicaController> logger)
        {
            _logger = logger;
        }

        // GET /Hortalica/{usuarioId}
        // Lista todas as hortaliças cadastradas por um usuário específico
        [HttpGet("{usuarioId}", Name = "GetHortalicasByUsuario")]
        public IEnumerable<Hortalica> Get(int usuarioId)
        {
            List<Hortalica> hortalicas = new List<Hortalica>();

            using (SqlConnection connection = new SqlConnection(ConnStr))
            {
                string query = "SELECT * FROM Hortalicas WHERE UsuarioId = @UsuarioId ORDER BY HortalicaId DESC";
                SqlCommand command = new SqlCommand(query, connection);
                command.Parameters.AddWithValue("@UsuarioId", usuarioId);
                connection.Open();

                SqlDataReader reader = command.ExecuteReader();

                while (reader.Read())
                {
                    hortalicas.Add(MapReaderToHortalica(reader));
                }

                reader.Close();
            }

            return hortalicas;
        }

        // GET /Hortalica/{usuarioId}/{id}
        // Busca uma hortaliça específica, garantindo que pertence ao usuário
        [HttpGet("{usuarioId}/{id}", Name = "GetHortalicaById")]
        public ActionResult GetHortalicaById(int usuarioId, int id)
        {
            using (SqlConnection connection = new SqlConnection(ConnStr))
            {
                string query = "SELECT * FROM Hortalicas WHERE Id = @Id AND UsuarioId = @UsuarioId";
                SqlCommand command = new SqlCommand("SELECT * FROM Hortalicas WHERE HortalicaId = @Id AND UsuarioId = @UsuarioId", connection);
                command.Parameters.AddWithValue("@Id", id);
                command.Parameters.AddWithValue("@UsuarioId", usuarioId);
                connection.Open();

                SqlDataReader reader = command.ExecuteReader();

                if (reader.Read())
                {
                    Hortalica hortalica = MapReaderToHortalica(reader);
                    reader.Close();
                    return Ok(hortalica);
                }

                reader.Close();
            }

            return NotFound();
        }

        // POST /Hortalica
        // Cria uma nova hortaliça. O UsuarioId vem no corpo da requisição
        // (idealmente deveria vir de um token de autenticação, e não do client)
        [HttpPost]
        public ActionResult CreateHortalica(Hortalica hortalica)
        {
            using (SqlConnection connection = new SqlConnection(ConnStr))
            {
                string query = @"INSERT INTO Hortalicas
                                  (UsuarioId, Nome, Categoria, QuantidadePlantada, UnidadeMedida,
                                   DataPlantio, PrevisaoColheita, CaminhoImagem, Observacoes)
                                  VALUES
                                  (@UsuarioId, @Nome, @Categoria, @QuantidadePlantada, @UnidadeMedida,
                                   @DataPlantio, @PrevisaoColheita, @CaminhoImagem, @Observacoes)";

                SqlCommand command = new SqlCommand(query, connection);
                AddCommonParameters(command, hortalica);

                connection.Open();
                int rowsAffected = command.ExecuteNonQuery();

                if (rowsAffected > 0)
                {
                    return Ok();
                }
            }
            return BadRequest();
        }

        // PUT /Hortalica/{id}?usuarioId={usuarioId}
        // Atualiza uma hortaliça, garantindo que pertence ao usuário informado
        [HttpPut("{id}")]
        public ActionResult UpdateHortalica(int id, [FromQuery] int usuarioId, [FromBody] Hortalica hortalica)
        {
            using (SqlConnection connection = new SqlConnection(ConnStr))
            {
                string query = @"UPDATE Hortalicas SET
                                  Nome = @Nome,
                                  Categoria = @Categoria,
                                  QuantidadePlantada = @QuantidadePlantada,
                                  UnidadeMedida = @UnidadeMedida,
                                  DataPlantio = @DataPlantio,
                                  PrevisaoColheita = @PrevisaoColheita,
                                  CaminhoImagem = @CaminhoImagem,
                                  Observacoes = @Observacoes,
                                  DataAtualizacao = GETDATE()
                                  WHERE HortalicaId = @Id AND UsuarioId = @UsuarioId";

                SqlCommand command = new SqlCommand(query, connection);
                AddCommonParameters(command, hortalica);
                command.Parameters.AddWithValue("@Id", id);
                command.Parameters["@UsuarioId"].Value = usuarioId; // garante que o UsuarioId usado é o da query, não o do corpo

                connection.Open();
                int rowsAffected = command.ExecuteNonQuery();

                if (rowsAffected > 0)
                {
                    return Ok();
                }
            }

            return NotFound();
        }

        // DELETE /Hortalica/{id}?usuarioId={usuarioId}
        // Exclui a hortaliça apenas se ela pertencer ao usuário informado
        [HttpDelete("{id}")]
        public ActionResult DeleteHortalica(int id, [FromQuery] int usuarioId)
        {
            using (SqlConnection connection = new SqlConnection(ConnStr))
            {
                string query = "DELETE FROM Hortalicas WHERE HortalicaId = @Id AND UsuarioId = @UsuarioId";
                SqlCommand command = new SqlCommand(query, connection);
                command.Parameters.AddWithValue("@Id", id);
                command.Parameters.AddWithValue("@UsuarioId", usuarioId);
                connection.Open();

                int rowsAffected = command.ExecuteNonQuery();

                if (rowsAffected > 0)
                {
                    return Ok();
                }
            }
            return NotFound();
        }

        // -------------------- Helpers --------------------

        private static Hortalica MapReaderToHortalica(SqlDataReader reader)
        {
            return new Hortalica
            {
                Id = Convert.ToInt32(reader["HortalicaId"]),
                UsuarioId = Convert.ToInt32(reader["UsuarioId"]),
                Nome = reader["Nome"].ToString(),
                Categoria = reader["Categoria"] as string,
                QuantidadePlantada = reader["QuantidadePlantada"] != DBNull.Value ? Convert.ToDecimal(reader["QuantidadePlantada"]) : (decimal?)null,
                UnidadeMedida = reader["UnidadeMedida"] as string,
                DataPlantio = reader["DataPlantio"] != DBNull.Value ? Convert.ToDateTime(reader["DataPlantio"]) : (DateTime?)null,
                PrevisaoColheita = reader["PrevisaoColheita"] != DBNull.Value ? Convert.ToDateTime(reader["PrevisaoColheita"]) : (DateTime?)null,
                CaminhoImagem = reader["CaminhoImagem"] as string,
                Observacoes = reader["Observacoes"] as string,
                Ativo = Convert.ToBoolean(reader["Ativo"]),
                DataCriacao = Convert.ToDateTime(reader["DataCriacao"]),
                DataAtualizacao = reader["DataAtualizacao"] != DBNull.Value ? Convert.ToDateTime(reader["DataAtualizacao"]) : (DateTime?)null
            };
        }

        private static void AddCommonParameters(SqlCommand command, Hortalica hortalica)
        {
            command.Parameters.AddWithValue("@UsuarioId", hortalica.UsuarioId);
            command.Parameters.AddWithValue("@Nome", hortalica.Nome ?? (object)DBNull.Value);
            command.Parameters.AddWithValue("@Categoria", (object)hortalica.Categoria ?? DBNull.Value);
            command.Parameters.AddWithValue("@QuantidadePlantada", (object)hortalica.QuantidadePlantada ?? DBNull.Value);
            command.Parameters.AddWithValue("@UnidadeMedida", (object)hortalica.UnidadeMedida ?? DBNull.Value);
            command.Parameters.AddWithValue("@DataPlantio", (object)hortalica.DataPlantio ?? DBNull.Value);
            command.Parameters.AddWithValue("@PrevisaoColheita", (object)hortalica.PrevisaoColheita ?? DBNull.Value);
            command.Parameters.AddWithValue("@CaminhoImagem", (object)hortalica.CaminhoImagem ?? DBNull.Value);
            command.Parameters.AddWithValue("@Observacoes", (object)hortalica.Observacoes ?? DBNull.Value);
        }
    }
}