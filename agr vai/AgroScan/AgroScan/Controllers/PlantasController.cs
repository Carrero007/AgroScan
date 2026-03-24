using AgroScan.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;

namespace AgroScan.Controllers
{
    [ApiController]
    [Route("[controller]")]
    public class PlantasController : ControllerBase
    {
        private readonly IConfiguration _config;
        // Lê do appsettings.json
        private string ConnStr => _config.GetConnectionString("DefaultConnection")!;

        public PlantasController(IConfiguration config)
        {
            _config = config;
        }

        [HttpGet]
        public IActionResult Get()
        {
            var lista = new List<Plantas>();
            try
            {
                using var conn = new SqlConnection(ConnStr);
                using var cmd = new SqlCommand("SELECT * FROM Plantas ORDER BY DataCriacao DESC", conn);
                conn.Open();
                using var reader = cmd.ExecuteReader();

                while (reader.Read())
                {
                    lista.Add(MapReader(reader));
                }
                return Ok(lista);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { erro = ex.Message });
            }
        }

        [HttpGet("{id}")]
        public IActionResult GetById(int id)
        {
            try
            {
                using var conn = new SqlConnection(ConnStr);
                using var cmd = new SqlCommand("SELECT * FROM Plantas WHERE PlantaId=@id", conn);
                cmd.Parameters.AddWithValue("@id", id);
                conn.Open();
                using var reader = cmd.ExecuteReader();
                if (reader.Read()) return Ok(MapReader(reader));
                return NotFound();
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { erro = ex.Message });
            }
        }

        [HttpPost]
        public IActionResult Create([FromBody] Plantas p)
        {
            if (p == null || string.IsNullOrWhiteSpace(p.NomeCientifico))
                return BadRequest(new { erro = "NomeCientifico é obrigatório." });

            try
            {
                using var conn = new SqlConnection(ConnStr);
                // Insere todos os campos mapeados do schema real
                var query = @"INSERT INTO Plantas 
                    (NomeCientifico, NomePopular, TipoPlanta, CicloVida, Clima, Luminosidade, Rega,
                     TipoSolo, Familia, Origem, EhMedicinal, EhComestivel, EhToxica, Usos, Descricao, DataCriacao)
                    VALUES
                    (@n1,@n2,@n3,@n4,@n5,@n6,@n7,@n8,@n9,@n10,@n11,@n12,@n13,@n14,@n15,GETDATE())";

                using var cmd = new SqlCommand(query, conn);
                cmd.Parameters.AddWithValue("@n1", p.NomeCientifico ?? "");
                cmd.Parameters.AddWithValue("@n2", p.NomePopular ?? "");
                cmd.Parameters.AddWithValue("@n3", p.TipoPlanta ?? "");
                cmd.Parameters.AddWithValue("@n4", p.CicloVida ?? "");
                cmd.Parameters.AddWithValue("@n5", p.Clima ?? "");
                cmd.Parameters.AddWithValue("@n6", p.Luminosidade ?? "");
                cmd.Parameters.AddWithValue("@n7", p.Rega ?? "");
                cmd.Parameters.AddWithValue("@n8", p.TipoSolo ?? "");
                cmd.Parameters.AddWithValue("@n9", p.Familia ?? "");
                cmd.Parameters.AddWithValue("@n10", p.Origem ?? "");
                cmd.Parameters.AddWithValue("@n11", p.EhMedicinal);
                cmd.Parameters.AddWithValue("@n12", p.EhComestivel);
                cmd.Parameters.AddWithValue("@n13", p.EhToxica);
                cmd.Parameters.AddWithValue("@n14", p.Usos ?? "");
                cmd.Parameters.AddWithValue("@n15", p.Descricao ?? "");
                conn.Open();
                cmd.ExecuteNonQuery();

                return Ok(new { mensagem = "Planta criada com sucesso." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { erro = ex.Message });
            }
        }

        [HttpPut("{id}")]
        public IActionResult Update(int id, [FromBody] Plantas p)
        {
            try
            {
                using var conn = new SqlConnection(ConnStr);
                var query = @"UPDATE Plantas SET
                    NomeCientifico=@n1, NomePopular=@n2, TipoPlanta=@n3, CicloVida=@n4,
                    Clima=@n5, Luminosidade=@n6, Rega=@n7, TipoSolo=@n8,
                    Familia=@n9, Origem=@n10, EhMedicinal=@n11, EhComestivel=@n12,
                    EhToxica=@n13, Usos=@n14, Descricao=@n15, DataAtualizacao=GETDATE()
                    WHERE PlantaId=@id";

                using var cmd = new SqlCommand(query, conn);
                cmd.Parameters.AddWithValue("@id", id);
                cmd.Parameters.AddWithValue("@n1", p.NomeCientifico ?? "");
                cmd.Parameters.AddWithValue("@n2", p.NomePopular ?? "");
                cmd.Parameters.AddWithValue("@n3", p.TipoPlanta ?? "");
                cmd.Parameters.AddWithValue("@n4", p.CicloVida ?? "");
                cmd.Parameters.AddWithValue("@n5", p.Clima ?? "");
                cmd.Parameters.AddWithValue("@n6", p.Luminosidade ?? "");
                cmd.Parameters.AddWithValue("@n7", p.Rega ?? "");
                cmd.Parameters.AddWithValue("@n8", p.TipoSolo ?? "");
                cmd.Parameters.AddWithValue("@n9", p.Familia ?? "");
                cmd.Parameters.AddWithValue("@n10", p.Origem ?? "");
                cmd.Parameters.AddWithValue("@n11", p.EhMedicinal);
                cmd.Parameters.AddWithValue("@n12", p.EhComestivel);
                cmd.Parameters.AddWithValue("@n13", p.EhToxica);
                cmd.Parameters.AddWithValue("@n14", p.Usos ?? "");
                cmd.Parameters.AddWithValue("@n15", p.Descricao ?? "");
                conn.Open();
                cmd.ExecuteNonQuery();

                return Ok(new { mensagem = "Planta atualizada." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { erro = ex.Message });
            }
        }

        [HttpDelete("{id}")]
        public IActionResult Delete(int id)
        {
            try
            {
                using var conn = new SqlConnection(ConnStr);
                using var cmd = new SqlCommand("DELETE FROM Plantas WHERE PlantaId=@id", conn);
                cmd.Parameters.AddWithValue("@id", id);
                conn.Open();
                cmd.ExecuteNonQuery();
                return Ok(new { mensagem = "Planta removida." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { erro = ex.Message });
            }
        }

        // ── Mapper reutilizável ──
        private static Plantas MapReader(SqlDataReader r) => new Plantas
        {
            PlantaId = (int)r["PlantaId"],
            NomeCientifico = r["NomeCientifico"].ToString()!,
            NomePopular = r["NomePopular"] == DBNull.Value ? "" : r["NomePopular"].ToString()!,
            TipoPlanta = r["TipoPlanta"] == DBNull.Value ? "" : r["TipoPlanta"].ToString()!,
            CicloVida = r["CicloVida"] == DBNull.Value ? "" : r["CicloVida"].ToString()!,
            Clima = r["Clima"] == DBNull.Value ? "" : r["Clima"].ToString()!,
            Luminosidade = r["Luminosidade"] == DBNull.Value ? "" : r["Luminosidade"].ToString()!,
            Rega = r["Rega"] == DBNull.Value ? "" : r["Rega"].ToString()!,
            TipoSolo = r["TipoSolo"] == DBNull.Value ? "" : r["TipoSolo"].ToString()!,
            Familia = r["Familia"] == DBNull.Value ? "" : r["Familia"].ToString()!,
            Origem = r["Origem"] == DBNull.Value ? "" : r["Origem"].ToString()!,
            EhMedicinal = r["EhMedicinal"] != DBNull.Value && (bool)r["EhMedicinal"],
            EhComestivel = r["EhComestivel"] != DBNull.Value && (bool)r["EhComestivel"],
            EhToxica = r["EhToxica"] != DBNull.Value && (bool)r["EhToxica"],
            Usos = r["Usos"] == DBNull.Value ? "" : r["Usos"].ToString()!,
            Descricao = r["Descricao"] == DBNull.Value ? "" : r["Descricao"].ToString()!
        };
    }
}