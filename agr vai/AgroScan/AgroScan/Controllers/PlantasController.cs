using AgroScan.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;

namespace AgroScan.Controllers
{
    [ApiController]
    [Route("[controller]")]
    public class PlantasController : Controller
    {
        private const string ConnectionString = "Data Source=(localdb)\\MSSQLLocalDB;Initial Catalog=AgroScan;Integrated Security=True";

        [HttpGet]
        public IEnumerable<Plantas> Get()
        {
            List<Plantas> lista = new List<Plantas>();

            using (SqlConnection conn = new SqlConnection(ConnectionString))
            {
                string query = "SELECT * FROM Plantas";
                SqlCommand cmd = new SqlCommand(query, conn);
                conn.Open();

                SqlDataReader reader = cmd.ExecuteReader();

                while (reader.Read())
                {
                    lista.Add(new Plantas
                    {
                        PlantaId = (int)reader["PlantaId"],
                        NomeCientifico = reader["NomeCientifico"].ToString(),
                        NomePopular = reader["NomePopular"].ToString(),
                        TipoPlanta = reader["TipoPlanta"].ToString(),
                        Clima = reader["Clima"].ToString(),
                        Luminosidade = reader["Luminosidade"].ToString(),
                        Rega = reader["Rega"].ToString(),
                        Descricao = reader["Descricao"].ToString()
                    });
                }
            }
            return lista;
        }

        [HttpPost]
        public IActionResult Create([FromBody] Plantas p)
        {
            using (SqlConnection conn = new SqlConnection(ConnectionString))
            {
                string query = @"INSERT INTO Plantas 
                (NomeCientifico, NomePopular, TipoPlanta, Clima, Luminosidade, Rega, Descricao)
                VALUES (@n1,@n2,@n3,@n4,@n5,@n6,@n7)";

                SqlCommand cmd = new SqlCommand(query, conn);
                cmd.Parameters.AddWithValue("@n1", p.NomeCientifico);
                cmd.Parameters.AddWithValue("@n2", p.NomePopular);
                cmd.Parameters.AddWithValue("@n3", p.TipoPlanta);
                cmd.Parameters.AddWithValue("@n4", p.Clima);
                cmd.Parameters.AddWithValue("@n5", p.Luminosidade);
                cmd.Parameters.AddWithValue("@n6", p.Rega);
                cmd.Parameters.AddWithValue("@n7", p.Descricao);

                conn.Open();
                cmd.ExecuteNonQuery();
            }

            return Ok();
        }

        [HttpPut("{id}")]
        public IActionResult Update(int id, [FromBody] Plantas p)
        {
            using (SqlConnection conn = new SqlConnection(ConnectionString))
            {
                string query = @"UPDATE Plantas SET
                NomeCientifico=@n1, NomePopular=@n2, TipoPlanta=@n3,
                Clima=@n4, Luminosidade=@n5, Rega=@n6, Descricao=@n7
                WHERE PlantaId=@id";

                SqlCommand cmd = new SqlCommand(query, conn);
                cmd.Parameters.AddWithValue("@id", id);
                cmd.Parameters.AddWithValue("@n1", p.NomeCientifico);
                conn.Open();
                cmd.ExecuteNonQuery();
            }

            return Ok();
        }

        [HttpDelete("{id}")]
        public IActionResult Delete(int id)
        {
            using (SqlConnection conn = new SqlConnection(ConnectionString))
            {
                string query = "DELETE FROM Plantas WHERE PlantaId=@id";
                SqlCommand cmd = new SqlCommand(query, conn);
                cmd.Parameters.AddWithValue("@id", id);

                conn.Open();
                cmd.ExecuteNonQuery();
            }

            return Ok();
        }
    }
}