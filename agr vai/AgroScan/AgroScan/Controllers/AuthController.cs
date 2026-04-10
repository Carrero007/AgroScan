using AgroScan.Models;
using AgroScan.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;

namespace AgroScan.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AuthController : ControllerBase
    {
        private readonly IConfiguration _config;
        private readonly JwtService _jwt;
        private readonly ILogger<AuthController> _logger;
        private string ConnStr => _config.GetConnectionString("DefaultConnection")!;

        public AuthController(IConfiguration config, JwtService jwt, ILogger<AuthController> logger)
        {
            _config = config;
            _jwt = jwt;
            _logger = logger;
        }

        // POST api/auth/login
        [HttpPost("login")]
        public ActionResult<AuthResponse> Login([FromBody] LoginRequest req)
        {
            if (string.IsNullOrWhiteSpace(req.CPF) || string.IsNullOrWhiteSpace(req.Senha))
                return BadRequest(new { erro = "CPF e Senha sao obrigatorios." });

            var cpf = req.CPF.Replace(".", "").Replace("-", "").Trim();

            try
            {
                Usuario? usuario = null;
                string senhaHash = string.Empty;
                bool ativo = false;

                // Conexao 1: busca o usuario
                using (var conn = new SqlConnection(ConnStr))
                {
                    const string sql = "SELECT UsuarioId, Nome, CPF, SenhaHash, Ativo FROM Usuarios WHERE CPF = @cpf";
                    using var cmd = new SqlCommand(sql, conn);
                    cmd.Parameters.AddWithValue("@cpf", cpf);
                    conn.Open();
                    using var reader = cmd.ExecuteReader();

                    if (!reader.Read())
                        return Unauthorized(new { erro = "CPF ou senha invalidos." });

                    ativo = (bool)reader["Ativo"];
                    senhaHash = reader["SenhaHash"].ToString()!;
                    usuario = new Usuario
                    {
                        UsuarioId = (int)reader["UsuarioId"],
                        Nome = reader["Nome"].ToString()!,
                        CPF = reader["CPF"].ToString()!
                    };
                } // conn fechada aqui - reader e conn descartados pelo using

                if (!ativo)
                    return Unauthorized(new { erro = "Conta desativada. Entre em contato com o suporte." });

                if (!BCrypt.Net.BCrypt.Verify(req.Senha, senhaHash))
                    return Unauthorized(new { erro = "CPF ou senha invalidos." });

                // Conexao 2: atualiza ultimo login (conexao separada, nao critica)
                try
                {
                    using var conn2 = new SqlConnection(ConnStr);
                    using var cmd2 = new SqlCommand("UPDATE Usuarios SET UltimoLogin = GETUTCDATE() WHERE UsuarioId = @id", conn2);
                    cmd2.Parameters.AddWithValue("@id", usuario.UsuarioId);
                    conn2.Open();
                    cmd2.ExecuteNonQuery();
                }
                catch { /* nao critico - nao impede o login */ }

                var ip = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "";
                var accessToken = _jwt.GerarAccessToken(usuario);
                var refreshToken = _jwt.GerarRefreshToken(usuario.UsuarioId, ConnStr, ip);
                var expMin = int.TryParse(_config["Jwt:ExpiracaoMinutos"], out var m) ? m : 60;

                return Ok(new AuthResponse
                {
                    Token = accessToken,
                    RefreshToken = refreshToken,
                    Expiracao = DateTime.UtcNow.AddMinutes(expMin),
                    Nome = usuario.Nome,
                    UsuarioId = usuario.UsuarioId
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Erro no login CPF={CPF}", cpf);
                return StatusCode(500, new { erro = "Erro interno." });
            }
        }

        // POST api/auth/cadastrar
        [HttpPost("cadastrar")]
        public ActionResult Cadastrar([FromBody] CadastroRequest req)
        {
            if (string.IsNullOrWhiteSpace(req.Nome) || req.Nome.Trim().Length < 3)
                return BadRequest(new { erro = "Nome invalido (minimo 3 caracteres)." });

            var cpf = req.CPF?.Replace(".", "").Replace("-", "").Trim() ?? "";
            if (cpf.Length != 11 || !cpf.All(char.IsDigit))
                return BadRequest(new { erro = "CPF deve conter exatamente 11 digitos numericos." });

            if (string.IsNullOrWhiteSpace(req.Senha) || req.Senha.Length < 6)
                return BadRequest(new { erro = "Senha muito curta (minimo 6 caracteres)." });

            var senhaHash = BCrypt.Net.BCrypt.HashPassword(req.Senha, workFactor: 12);

            try
            {
                using var conn = new SqlConnection(ConnStr);
                const string sql = @"
                    INSERT INTO Usuarios (CPF, SenhaHash, Nome, Whatsapp, Latitude, Longitude, TipoProdutor, AreaHectares)
                    VALUES (@cpf, @hash, @nome, @whats, @lat, @lng, @tipo, @area)";
                using var cmd = new SqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("@cpf", cpf);
                cmd.Parameters.AddWithValue("@hash", senhaHash);
                cmd.Parameters.AddWithValue("@nome", req.Nome.Trim());
                cmd.Parameters.AddWithValue("@whats", (object?)req.Whatsapp ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@lat", (object?)req.Latitude ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@lng", (object?)req.Longitude ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@tipo", (object?)req.TipoProdutor ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@area", (object?)req.AreaHectares ?? DBNull.Value);
                conn.Open();
                cmd.ExecuteNonQuery();
                return Ok(new { sucesso = true, mensagem = "Cadastro realizado com sucesso!" });
            }
            catch (SqlException ex) when (ex.Number == 2627 || ex.Number == 2601)
            {
                return Conflict(new { erro = "Este CPF ja esta cadastrado." });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Erro ao cadastrar usuario.");
                return StatusCode(500, new { erro = "Erro interno no servidor." });
            }
        }

        // POST api/auth/refresh
        [HttpPost("refresh")]
        public ActionResult<AuthResponse> Refresh([FromBody] RefreshTokenRequest req)
        {
            if (string.IsNullOrWhiteSpace(req.RefreshToken))
                return BadRequest(new { erro = "RefreshToken e obrigatorio." });

            var usuarioId = _jwt.ValidarRefreshToken(req.RefreshToken, ConnStr);
            if (usuarioId == null)
                return Unauthorized(new { erro = "RefreshToken invalido ou expirado." });

            try
            {
                Usuario? usuario = null;

                using (var conn = new SqlConnection(ConnStr))
                {
                    const string sql = "SELECT UsuarioId, Nome, CPF FROM Usuarios WHERE UsuarioId = @id AND Ativo = 1";
                    using var cmd = new SqlCommand(sql, conn);
                    cmd.Parameters.AddWithValue("@id", usuarioId.Value);
                    conn.Open();
                    using var reader = cmd.ExecuteReader();
                    if (!reader.Read())
                        return Unauthorized(new { erro = "Usuario nao encontrado." });

                    usuario = new Usuario
                    {
                        UsuarioId = (int)reader["UsuarioId"],
                        Nome = reader["Nome"].ToString()!,
                        CPF = reader["CPF"].ToString()!
                    };
                }

                // Rotacao: revoga o token antigo e gera novo par
                _jwt.RevogarRefreshToken(req.RefreshToken, ConnStr);
                var ip = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "";
                var newRefresh = _jwt.GerarRefreshToken(usuario.UsuarioId, ConnStr, ip);
                var accessToken = _jwt.GerarAccessToken(usuario);
                var expMin = int.TryParse(_config["Jwt:ExpiracaoMinutos"], out var m) ? m : 60;

                return Ok(new AuthResponse
                {
                    Token = accessToken,
                    RefreshToken = newRefresh,
                    Expiracao = DateTime.UtcNow.AddMinutes(expMin),
                    Nome = usuario.Nome,
                    UsuarioId = usuario.UsuarioId
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Erro ao renovar token.");
                return StatusCode(500, new { erro = "Erro interno." });
            }
        }

        // POST api/auth/logout
        [HttpPost("logout")]
        public ActionResult Logout([FromBody] RefreshTokenRequest req)
        {
            if (!string.IsNullOrWhiteSpace(req.RefreshToken))
            {
                try { _jwt.RevogarRefreshToken(req.RefreshToken, ConnStr); }
                catch { /* silencia erros de logout */ }
            }
            return Ok(new { mensagem = "Logout realizado." });
        }
    }
}