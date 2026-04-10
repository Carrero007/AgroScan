using AgroScan.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;

namespace AgroScan.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class HortalicasController : ControllerBase
    {
        private readonly IConfiguration _config;
        private string ConnStr => _config.GetConnectionString("DefaultConnection")!;

        public HortalicasController(IConfiguration config) => _config = config;

        [HttpGet]
        public IActionResult Get([FromQuery] string? categoria = null, [FromQuery] string? busca = null)
        {
            var lista = new List<Hortalica>();
            try
            {
                using var conn = new SqlConnection(ConnStr);
                var sql = "SELECT * FROM Hortalicas WHERE 1=1";
                if (!string.IsNullOrWhiteSpace(categoria)) sql += " AND Categoria = @cat";
                if (!string.IsNullOrWhiteSpace(busca)) sql += " AND (NomePopular LIKE @busca OR NomeCientifico LIKE @busca)";
                sql += " ORDER BY NomePopular";

                using var cmd = new SqlCommand(sql, conn);
                if (!string.IsNullOrWhiteSpace(categoria)) cmd.Parameters.AddWithValue("@cat", categoria);
                if (!string.IsNullOrWhiteSpace(busca)) cmd.Parameters.AddWithValue("@busca", $"%{busca}%");

                conn.Open();
                using var reader = cmd.ExecuteReader();
                while (reader.Read()) lista.Add(MapHortalica(reader));
                return Ok(lista);
            }
            catch (Exception ex) { return StatusCode(500, new { erro = ex.Message }); }
        }

        [HttpGet("{id}")]
        public IActionResult GetById(int id)
        {
            try
            {
                using var conn = new SqlConnection(ConnStr);
                using var cmd = new SqlCommand("SELECT * FROM Hortalicas WHERE HortalicaId = @id", conn);
                cmd.Parameters.AddWithValue("@id", id);
                conn.Open();
                using var reader = cmd.ExecuteReader();
                if (reader.Read()) return Ok(MapHortalica(reader));
                return NotFound();
            }
            catch (Exception ex) { return StatusCode(500, new { erro = ex.Message }); }
        }

        [HttpPost]
        public IActionResult Create([FromBody] Hortalica h)
        {
            if (h == null || string.IsNullOrWhiteSpace(h.NomeCientifico))
                return BadRequest(new { erro = "NomeCientifico é obrigatório." });
            try
            {
                using var conn = new SqlConnection(ConnStr);
                const string sql = @"
                    INSERT INTO Hortalicas
                        (NomeCientifico, NomePopular, Familia, Categoria, CicloVida, DiasGerminacao,
                         DiasColheita, Espacamento, ProfundidadeSemeio, Clima, TemperaturaMin, TemperaturaMax,
                         Luminosidade, Irrigacao, NecessidadeAgua, TipoSolo, PHMin, PHMax, Adubacao,
                         PragasPrincipais, DoencasPrincipais, Origem, ValorNutricional, Observacoes)
                    VALUES
                        (@nc,@np,@fam,@cat,@ciclo,@dg,@dc,@esp,@prof,@clim,@tmin,@tmax,
                         @lum,@irrig,@agua,@solo,@phmin,@phmax,@adub,@pragas,@doencas,@orig,@nutri,@obs)";
                using var cmd = new SqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("@nc", h.NomeCientifico);
                cmd.Parameters.AddWithValue("@np", (object?)h.NomePopular ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@fam", (object?)h.Familia ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@cat", (object?)h.Categoria ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@ciclo", (object?)h.CicloVida ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@dg", (object?)h.DiasGerminacao ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@dc", (object?)h.DiasColheita ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@esp", (object?)h.Espacamento ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@prof", (object?)h.ProfundidadeSemeio ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@clim", (object?)h.Clima ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@tmin", (object?)h.TemperaturaMin ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@tmax", (object?)h.TemperaturaMax ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@lum", (object?)h.Luminosidade ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@irrig", (object?)h.Irrigacao ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@agua", (object?)h.NecessidadeAgua ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@solo", (object?)h.TipoSolo ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@phmin", (object?)h.PHMin ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@phmax", (object?)h.PHMax ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@adub", (object?)h.Adubacao ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@pragas", (object?)h.PragasPrincipais ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@doencas", (object?)h.DoencasPrincipais ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@orig", (object?)h.Origem ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@nutri", (object?)h.ValorNutricional ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@obs", (object?)h.Observacoes ?? DBNull.Value);
                conn.Open();
                cmd.ExecuteNonQuery();
                return Ok(new { mensagem = "Hortaliça criada com sucesso." });
            }
            catch (Exception ex) { return StatusCode(500, new { erro = ex.Message }); }
        }

        [HttpDelete("{id}")]
        public IActionResult Delete(int id)
        {
            try
            {
                using var conn = new SqlConnection(ConnStr);
                using var cmd = new SqlCommand("DELETE FROM Hortalicas WHERE HortalicaId = @id", conn);
                cmd.Parameters.AddWithValue("@id", id);
                conn.Open();
                cmd.ExecuteNonQuery();
                return Ok(new { mensagem = "Hortaliça removida." });
            }
            catch (Exception ex) { return StatusCode(500, new { erro = ex.Message }); }
        }

        private static Hortalica MapHortalica(SqlDataReader r) => new()
        {
            HortalicaId = (int)r["HortalicaId"],
            NomeCientifico = r["NomeCientifico"].ToString()!,
            NomePopular = r["NomePopular"] == DBNull.Value ? null : r["NomePopular"].ToString(),
            Familia = r["Familia"] == DBNull.Value ? null : r["Familia"].ToString(),
            Categoria = r["Categoria"] == DBNull.Value ? null : r["Categoria"].ToString(),
            CicloVida = r["CicloVida"] == DBNull.Value ? null : r["CicloVida"].ToString(),
            DiasGerminacao = r["DiasGerminacao"] == DBNull.Value ? null : (int?)r["DiasGerminacao"],
            DiasColheita = r["DiasColheita"] == DBNull.Value ? null : (int?)r["DiasColheita"],
            Espacamento = r["Espacamento"] == DBNull.Value ? null : r["Espacamento"].ToString(),
            Clima = r["Clima"] == DBNull.Value ? null : r["Clima"].ToString(),
            TemperaturaMin = r["TemperaturaMin"] == DBNull.Value ? null : (decimal?)r["TemperaturaMin"],
            TemperaturaMax = r["TemperaturaMax"] == DBNull.Value ? null : (decimal?)r["TemperaturaMax"],
            Luminosidade = r["Luminosidade"] == DBNull.Value ? null : r["Luminosidade"].ToString(),
            Irrigacao = r["Irrigacao"] == DBNull.Value ? null : r["Irrigacao"].ToString(),
            TipoSolo = r["TipoSolo"] == DBNull.Value ? null : r["TipoSolo"].ToString(),
            PHMin = r["PHMin"] == DBNull.Value ? null : (decimal?)r["PHMin"],
            PHMax = r["PHMax"] == DBNull.Value ? null : (decimal?)r["PHMax"],
            PragasPrincipais = r["PragasPrincipais"] == DBNull.Value ? null : r["PragasPrincipais"].ToString(),
            DoencasPrincipais = r["DoencasPrincipais"] == DBNull.Value ? null : r["DoencasPrincipais"].ToString(),
            Origem = r["Origem"] == DBNull.Value ? null : r["Origem"].ToString(),
            ValorNutricional = r["ValorNutricional"] == DBNull.Value ? null : r["ValorNutricional"].ToString(),
            Observacoes = r["Observacoes"] == DBNull.Value ? null : r["Observacoes"].ToString()
        };
    }
}