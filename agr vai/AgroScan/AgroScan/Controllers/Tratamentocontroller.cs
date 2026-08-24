using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using System.Text.Json;
using System.Linq;

namespace AgroScan.Controllers
{
    // ── Acompanhamento visual do tratamento de um diagnóstico ──────
    // Fluxo: nao_iniciado -> em_andamento -> curada (ou abandonado).
    // As "etapas" são o checklist visual (passos do tratamento vindos
    // da IA); ao concluir todas, o produtor pode marcar a hortaliça
    // como curada. Tudo isolado por UsuarioId (ninguém vê tratamento
    // alheio).
    [ApiController]
    [Route("api/tratamento")]
    [Authorize]
    public class TratamentoController : ControllerBase
    {
        private readonly IConfiguration _config;
        private readonly ILogger<TratamentoController> _logger;
        private string ConnStr => _config.GetConnectionString("DefaultConnection")!;

        public TratamentoController(IConfiguration config, ILogger<TratamentoController> logger)
        {
            _config = config;
            _logger = logger;
        }

        private int UsuarioIdAtual =>
            int.TryParse(User.FindFirst("sub")?.Value, out var id) ? id : 0;

        // GET /api/tratamento/{diagnosticoId}
        // Retorna o estado completo: dados do diagnóstico, status do
        // tratamento e a lista de etapas (cria as etapas na primeira
        // vez, a partir do TratamentoPassosJson salvo no diagnóstico).
        [HttpGet("{diagnosticoId}")]
        public IActionResult Obter(int diagnosticoId)
        {
            try
            {
                using var conn = new SqlConnection(ConnStr);
                conn.Open();

                var diag = BuscarDiagnostico(conn, diagnosticoId);
                if (diag == null) return NotFound(new { erro = "Diagnostico nao encontrado." });

                GarantirEtapasCriadas(conn, diagnosticoId, diag.Value.tratamentoPassosJson, diag.Value.tratamento);

                var etapas = ListarEtapas(conn, diagnosticoId)
                    .Select(e => new { etapaId = e.etapaId, descricao = e.descricao, ordem = e.ordem, concluida = e.concluida, dataConclusao = e.dataConclusao })
                    .ToList();

                return Ok(new
                {
                    diagnosticoId,
                    hortalicaNome = diag.Value.hortalicaNome,
                    nomeDoenca = diag.Value.nomeDoenca,
                    nomeCientifico = diag.Value.nomeCientifico,
                    tipoDiagnostico = diag.Value.tipoDiagnostico,
                    gravidade = diag.Value.gravidade,
                    statusTratamento = diag.Value.statusTratamento,
                    dataDiagnostico = diag.Value.dataDiagnostico,
                    dataInicioTratamento = diag.Value.dataInicioTratamento,
                    dataConclusaoTratamento = diag.Value.dataConclusaoTratamento,
                    tratamentoEcologico = diag.Value.tratamentoEcologico,
                    tratamentoQuimico = diag.Value.tratamentoQuimico,
                    prevencao = diag.Value.prevencao,
                    etapas
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Erro ao obter tratamento do diagnostico {Id}.", diagnosticoId);
                return StatusCode(500, new { erro = "Erro ao obter tratamento.", detalhe = ex.Message });
            }
        }

        // POST /api/tratamento/{diagnosticoId}/iniciar
        [HttpPost("{diagnosticoId}/iniciar")]
        public IActionResult Iniciar(int diagnosticoId)
        {
            using var conn = new SqlConnection(ConnStr);
            conn.Open();

            if (!PertenceAoUsuario(conn, diagnosticoId)) return NotFound(new { erro = "Diagnostico nao encontrado." });

            const string sql = @"
                UPDATE Diagnosticos
                SET StatusTratamento = 'em_andamento',
                    DataInicioTratamento = ISNULL(DataInicioTratamento, GETDATE())
                WHERE DiagnosticoId = @id AND UsuarioId = @uid";
            using var cmd = new SqlCommand(sql, conn);
            cmd.Parameters.AddWithValue("@id", diagnosticoId);
            cmd.Parameters.AddWithValue("@uid", UsuarioIdAtual);
            cmd.ExecuteNonQuery();

            return Ok(new { sucesso = true });
        }

        // PUT /api/tratamento/etapa/{etapaId}  { concluida: true|false }
        [HttpPut("etapa/{etapaId}")]
        public IActionResult AlternarEtapa(int etapaId, [FromBody] AlternarEtapaRequest req)
        {
            using var conn = new SqlConnection(ConnStr);
            conn.Open();

            // Garante que a etapa pertence a um diagnóstico do usuário logado
            const string sqlCheck = @"
                SELECT te.DiagnosticoId FROM TratamentoEtapas te
                INNER JOIN Diagnosticos d ON d.DiagnosticoId = te.DiagnosticoId
                WHERE te.EtapaId = @eid AND d.UsuarioId = @uid";
            int diagnosticoId;
            using (var cmdCheck = new SqlCommand(sqlCheck, conn))
            {
                cmdCheck.Parameters.AddWithValue("@eid", etapaId);
                cmdCheck.Parameters.AddWithValue("@uid", UsuarioIdAtual);
                var result = cmdCheck.ExecuteScalar();
                if (result == null) return NotFound(new { erro = "Etapa nao encontrada." });
                diagnosticoId = (int)result;
            }

            const string sqlUpdate = @"
                UPDATE TratamentoEtapas
                SET Concluida = @conc, DataConclusao = CASE WHEN @conc = 1 THEN GETDATE() ELSE NULL END
                WHERE EtapaId = @eid";
            using (var cmdUpdate = new SqlCommand(sqlUpdate, conn))
            {
                cmdUpdate.Parameters.AddWithValue("@conc", req.Concluida);
                cmdUpdate.Parameters.AddWithValue("@eid", etapaId);
                cmdUpdate.ExecuteNonQuery();
            }

            // Se ainda não estava em andamento, marca o início automaticamente
            // (o produtor começou a agir ao marcar a primeira etapa).
            const string sqlIniciar = @"
                UPDATE Diagnosticos
                SET StatusTratamento = CASE WHEN StatusTratamento = 'nao_iniciado' THEN 'em_andamento' ELSE StatusTratamento END,
                    DataInicioTratamento = ISNULL(DataInicioTratamento, GETDATE())
                WHERE DiagnosticoId = @id";
            using (var cmdIniciar = new SqlCommand(sqlIniciar, conn))
            {
                cmdIniciar.Parameters.AddWithValue("@id", diagnosticoId);
                cmdIniciar.ExecuteNonQuery();
            }

            var etapas = ListarEtapas(conn, diagnosticoId);
            var total = etapas.Count;
            var concluidas = etapas.Count(e => e.concluida);

            return Ok(new { sucesso = true, totalEtapas = total, etapasConcluidas = concluidas });
        }

        // POST /api/tratamento/{diagnosticoId}/concluir — marca como curada
        [HttpPost("{diagnosticoId}/concluir")]
        public IActionResult Concluir(int diagnosticoId)
        {
            using var conn = new SqlConnection(ConnStr);
            conn.Open();

            if (!PertenceAoUsuario(conn, diagnosticoId)) return NotFound(new { erro = "Diagnostico nao encontrado." });

            const string sql = @"
                UPDATE Diagnosticos
                SET StatusTratamento = 'curada',
                    DataInicioTratamento = ISNULL(DataInicioTratamento, GETDATE()),
                    DataConclusaoTratamento = GETDATE()
                WHERE DiagnosticoId = @id AND UsuarioId = @uid";
            using var cmd = new SqlCommand(sql, conn);
            cmd.Parameters.AddWithValue("@id", diagnosticoId);
            cmd.Parameters.AddWithValue("@uid", UsuarioIdAtual);
            cmd.ExecuteNonQuery();

            return Ok(new { sucesso = true });
        }

        // POST /api/tratamento/{diagnosticoId}/reabrir — volta para "em andamento"
        [HttpPost("{diagnosticoId}/reabrir")]
        public IActionResult Reabrir(int diagnosticoId)
        {
            using var conn = new SqlConnection(ConnStr);
            conn.Open();

            if (!PertenceAoUsuario(conn, diagnosticoId)) return NotFound(new { erro = "Diagnostico nao encontrado." });

            const string sql = @"
                UPDATE Diagnosticos
                SET StatusTratamento = 'em_andamento', DataConclusaoTratamento = NULL
                WHERE DiagnosticoId = @id AND UsuarioId = @uid";
            using var cmd = new SqlCommand(sql, conn);
            cmd.Parameters.AddWithValue("@id", diagnosticoId);
            cmd.Parameters.AddWithValue("@uid", UsuarioIdAtual);
            cmd.ExecuteNonQuery();

            return Ok(new { sucesso = true });
        }

        // ── Helpers ────────────────────────────────────────────────

        private bool PertenceAoUsuario(SqlConnection conn, int diagnosticoId)
        {
            using var cmd = new SqlCommand("SELECT COUNT(1) FROM Diagnosticos WHERE DiagnosticoId=@id AND UsuarioId=@uid", conn);
            cmd.Parameters.AddWithValue("@id", diagnosticoId);
            cmd.Parameters.AddWithValue("@uid", UsuarioIdAtual);
            return (int)cmd.ExecuteScalar() > 0;
        }

        private (string? hortalicaNome, string? nomeDoenca, string? nomeCientifico, string? tipoDiagnostico,
                  string? gravidade, string statusTratamento, DateTime dataDiagnostico,
                  DateTime? dataInicioTratamento, DateTime? dataConclusaoTratamento,
                  string? tratamentoEcologico, string? tratamentoQuimico, string? prevencao,
                  string? tratamentoPassosJson, string? tratamento)?
            BuscarDiagnostico(SqlConnection conn, int diagnosticoId)
        {
            const string sql = @"
                SELECT d.*, h.NomePopular AS HortalicaNome
                FROM Diagnosticos d
                LEFT JOIN Hortalicas h ON h.HortalicaId = d.HortalicaId
                WHERE d.DiagnosticoId = @id AND d.UsuarioId = @uid";
            using var cmd = new SqlCommand(sql, conn);
            cmd.Parameters.AddWithValue("@id", diagnosticoId);
            cmd.Parameters.AddWithValue("@uid", UsuarioIdAtual);
            using var r = cmd.ExecuteReader();
            if (!r.Read()) return null;

            string? GetStr(string col) => r[col] == DBNull.Value ? null : r[col].ToString();
            DateTime? GetDate(string col) => r[col] == DBNull.Value ? null : (DateTime)r[col];

            return (
                GetStr("HortalicaNome"),
                GetStr("NomeDoenca"),
                GetStr("NomeCientifico"),
                GetStr("TipoDiagnostico"),
                GetStr("Gravidade"),
                GetStr("StatusTratamento") ?? "nao_iniciado",
                (DateTime)r["DataDiagnostico"],
                GetDate("DataInicioTratamento"),
                GetDate("DataConclusaoTratamento"),
                GetStr("TratamentoEcologico"),
                GetStr("TratamentoQuimico"),
                GetStr("Prevencao"),
                GetStr("TratamentoPassosJson"),
                GetStr("Tratamento")
            );
        }

        /// <summary>Cria as etapas do checklist na primeira vez que o tratamento é aberto.</summary>
        private void GarantirEtapasCriadas(SqlConnection conn, int diagnosticoId, string? passosJson, string? tratamentoFallback)
        {
            using (var cmdCheck = new SqlCommand("SELECT COUNT(1) FROM TratamentoEtapas WHERE DiagnosticoId=@id", conn))
            {
                cmdCheck.Parameters.AddWithValue("@id", diagnosticoId);
                if ((int)cmdCheck.ExecuteScalar() > 0) return; // já existem, não recria
            }

            var passos = new List<string>();
            if (!string.IsNullOrWhiteSpace(passosJson))
            {
                try
                {
                    var arr = JsonSerializer.Deserialize<List<string>>(passosJson);
                    if (arr != null) passos.AddRange(arr.Where(p => !string.IsNullOrWhiteSpace(p)));
                }
                catch { /* JSON invalido - ignora e usa fallback abaixo */ }
            }
            if (passos.Count == 0 && !string.IsNullOrWhiteSpace(tratamentoFallback))
                passos.Add(tratamentoFallback);
            if (passos.Count == 0)
                passos.Add("Aplicar o tratamento recomendado pela IA.");

            // Etapa final fixa: acompanhamento pós-tratamento, sempre presente
            passos.Add("Observar a planta nos dias seguintes para confirmar a melhora.");

            const string sqlInsert = @"
                INSERT INTO TratamentoEtapas (DiagnosticoId, Descricao, Ordem, Concluida)
                VALUES (@did, @desc, @ord, 0)";
            for (int i = 0; i < passos.Count; i++)
            {
                using var cmd = new SqlCommand(sqlInsert, conn);
                cmd.Parameters.AddWithValue("@did", diagnosticoId);
                cmd.Parameters.AddWithValue("@desc", passos[i]);
                cmd.Parameters.AddWithValue("@ord", i + 1);
                cmd.ExecuteNonQuery();
            }
        }

        private List<(int etapaId, string descricao, int ordem, bool concluida, DateTime? dataConclusao)> ListarEtapas(SqlConnection conn, int diagnosticoId)
        {
            var lista = new List<(int, string, int, bool, DateTime?)>();
            const string sql = "SELECT * FROM TratamentoEtapas WHERE DiagnosticoId=@id ORDER BY Ordem";
            using var cmd = new SqlCommand(sql, conn);
            cmd.Parameters.AddWithValue("@id", diagnosticoId);
            using var r = cmd.ExecuteReader();
            while (r.Read())
            {
                lista.Add((
                    (int)r["EtapaId"],
                    r["Descricao"].ToString()!,
                    (int)r["Ordem"],
                    (bool)r["Concluida"],
                    r["DataConclusao"] == DBNull.Value ? null : (DateTime)r["DataConclusao"]
                ));
            }
            return lista;
        }
    }

    public class AlternarEtapaRequest
    {
        public bool Concluida { get; set; }
    }
}