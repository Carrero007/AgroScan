using AgroScan.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;

namespace AgroScan.Controllers
{
    // Catálogo agora é POR USUÁRIO — cada produtor só vê/edita as
    // hortaliças que ele mesmo cadastrou (UsuarioId na tabela).
    [ApiController]
    [Route("api/hortalicas")]
    [Authorize]
    public class HortalicaController : ControllerBase
    {
        private readonly ILogger<HortalicaController> _logger;
        private readonly IConfiguration _config;
        private string ConnStr => _config.GetConnectionString("DefaultConnection")!;

        private int UsuarioIdAtual =>
            int.TryParse(User.FindFirst("sub")?.Value, out var id) ? id : 0;

        public HortalicaController(ILogger<HortalicaController> logger, IConfiguration config)
        {
            _logger = logger;
            _config = config;
        }

        // GET /api/hortalicas
        [HttpGet]
        public IActionResult Get()
        {
            var lista = new List<Hortalica>();
            try
            {
                using var conn = new SqlConnection(ConnStr);
                using var cmd = new SqlCommand(
                    "SELECT * FROM Hortalicas WHERE UsuarioId = @uid ORDER BY NomePopular", conn);
                cmd.Parameters.AddWithValue("@uid", UsuarioIdAtual);
                conn.Open();
                using var reader = cmd.ExecuteReader();
                while (reader.Read()) lista.Add(MapReaderToHortalica(reader));
                return Ok(lista);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Erro ao listar hortalicas.");
                return StatusCode(500, new { erro = "Erro ao listar hortalicas.", detalhe = ex.Message });
            }
        }

        // GET /api/hortalicas/{id}
        [HttpGet("{id}")]
        public IActionResult GetById(int id)
        {
            try
            {
                using var conn = new SqlConnection(ConnStr);
                using var cmd = new SqlCommand(
                    "SELECT * FROM Hortalicas WHERE HortalicaId = @Id AND UsuarioId = @uid", conn);
                cmd.Parameters.AddWithValue("@Id", id);
                cmd.Parameters.AddWithValue("@uid", UsuarioIdAtual);
                conn.Open();
                using var reader = cmd.ExecuteReader();
                if (reader.Read()) return Ok(MapReaderToHortalica(reader));
                return NotFound();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Erro ao buscar hortalica {Id}.", id);
                return StatusCode(500, new { erro = "Erro ao buscar hortalica.", detalhe = ex.Message });
            }
        }

        // POST /api/hortalicas
        [HttpPost]
        public IActionResult Create([FromBody] Hortalica h)
        {
            if (string.IsNullOrWhiteSpace(h.NomeCientifico))
                return BadRequest(new { erro = "NomeCientifico e obrigatorio." });

            try
            {
                using var conn = new SqlConnection(ConnStr);
                const string sql = @"
                    INSERT INTO Hortalicas
                        (UsuarioId, NomeCientifico, NomePopular, Familia, Categoria, CicloVida,
                         DiasGerminacao, DiasColheita, Espacamento, Clima, Luminosidade,
                         Irrigacao, TipoSolo, Adubacao, PragasPrincipais, DoencasPrincipais,
                         Origem, ValorNutricional, Observacoes)
                    VALUES
                        (@uid, @nc, @np, @fam, @cat, @ciclo, @dg, @dc, @esp, @clima, @lum,
                         @irr, @solo, @adu, @pragas, @doencas, @origem, @valorNutri, @obs)";
                using var cmd = new SqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("@uid", UsuarioIdAtual);
                AddCommonParameters(cmd, h);
                conn.Open();
                cmd.ExecuteNonQuery();
                return Ok(new { sucesso = true });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Erro ao criar hortalica.");
                return StatusCode(500, new { erro = "Erro ao criar hortalica.", detalhe = ex.Message });
            }
        }

        // PUT /api/hortalicas/{id}
        [HttpPut("{id}")]
        public IActionResult Update(int id, [FromBody] Hortalica h)
        {
            try
            {
                using var conn = new SqlConnection(ConnStr);
                const string sql = @"
                    UPDATE Hortalicas SET
                        NomeCientifico = @nc, NomePopular = @np, Familia = @fam, Categoria = @cat,
                        CicloVida = @ciclo, DiasGerminacao = @dg, DiasColheita = @dc, Espacamento = @esp,
                        Clima = @clima, Luminosidade = @lum, Irrigacao = @irr, TipoSolo = @solo,
                        Adubacao = @adu, PragasPrincipais = @pragas, DoencasPrincipais = @doencas,
                        Origem = @origem, ValorNutricional = @valorNutri, Observacoes = @obs,
                        DataAtualizacao = GETDATE()
                    WHERE HortalicaId = @Id AND UsuarioId = @uid";
                using var cmd = new SqlCommand(sql, conn);
                AddCommonParameters(cmd, h);
                cmd.Parameters.AddWithValue("@Id", id);
                cmd.Parameters.AddWithValue("@uid", UsuarioIdAtual);
                conn.Open();
                var rows = cmd.ExecuteNonQuery();
                return rows > 0 ? Ok(new { sucesso = true }) : NotFound();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Erro ao atualizar hortalica {Id}.", id);
                return StatusCode(500, new { erro = "Erro ao atualizar hortalica.", detalhe = ex.Message });
            }
        }

        // DELETE /api/hortalicas/{id}
        [HttpDelete("{id}")]
        public IActionResult Delete(int id)
        {
            try
            {
                using var conn = new SqlConnection(ConnStr);
                using var cmd = new SqlCommand(
                    "DELETE FROM Hortalicas WHERE HortalicaId = @Id AND UsuarioId = @uid", conn);
                cmd.Parameters.AddWithValue("@Id", id);
                cmd.Parameters.AddWithValue("@uid", UsuarioIdAtual);
                conn.Open();
                var rows = cmd.ExecuteNonQuery();
                return rows > 0 ? Ok(new { sucesso = true }) : NotFound();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Erro ao excluir hortalica {Id}.", id);
                return StatusCode(500, new { erro = "Erro ao excluir hortalica.", detalhe = ex.Message });
            }
        }

        // -------------------- Helpers --------------------

        private static Hortalica MapReaderToHortalica(SqlDataReader r) => new()
        {
            HortalicaId = Convert.ToInt32(r["HortalicaId"]),
            UsuarioId = r["UsuarioId"] == DBNull.Value ? null : Convert.ToInt32(r["UsuarioId"]),
            NomeCientifico = r["NomeCientifico"].ToString() ?? "",
            NomePopular = r["NomePopular"] as string,
            Familia = r["Familia"] as string,
            Categoria = r["Categoria"] as string,
            CicloVida = r["CicloVida"] as string,
            DiasGerminacao = r["DiasGerminacao"] == DBNull.Value ? null : Convert.ToInt32(r["DiasGerminacao"]),
            DiasColheita = r["DiasColheita"] == DBNull.Value ? null : Convert.ToInt32(r["DiasColheita"]),
            Espacamento = r["Espacamento"] as string,
            Clima = r["Clima"] as string,
            Luminosidade = r["Luminosidade"] as string,
            Irrigacao = r["Irrigacao"] as string,
            TipoSolo = r["TipoSolo"] as string,
            Adubacao = r["Adubacao"] as string,
            PragasPrincipais = r["PragasPrincipais"] as string,
            DoencasPrincipais = r["DoencasPrincipais"] as string,
            Origem = r["Origem"] as string,
            ValorNutricional = r["ValorNutricional"] as string,
            Observacoes = r["Observacoes"] as string,
            DataCriacao = r["DataCriacao"] == DBNull.Value ? null : Convert.ToDateTime(r["DataCriacao"]),
            DataAtualizacao = r["DataAtualizacao"] == DBNull.Value ? null : Convert.ToDateTime(r["DataAtualizacao"]),
        };

        private static void AddCommonParameters(SqlCommand cmd, Hortalica h)
        {
            cmd.Parameters.AddWithValue("@nc", h.NomeCientifico);
            cmd.Parameters.AddWithValue("@np", (object?)h.NomePopular ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@fam", (object?)h.Familia ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@cat", (object?)h.Categoria ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@ciclo", (object?)h.CicloVida ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@dg", (object?)h.DiasGerminacao ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@dc", (object?)h.DiasColheita ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@esp", (object?)h.Espacamento ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@clima", (object?)h.Clima ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@lum", (object?)h.Luminosidade ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@irr", (object?)h.Irrigacao ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@solo", (object?)h.TipoSolo ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@adu", (object?)h.Adubacao ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@pragas", (object?)h.PragasPrincipais ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@doencas", (object?)h.DoencasPrincipais ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@origem", (object?)h.Origem ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@valorNutri", (object?)h.ValorNutricional ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@obs", (object?)h.Observacoes ?? DBNull.Value);
        }
    }
}