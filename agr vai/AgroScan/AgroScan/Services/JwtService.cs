using AgroScan.Models;
using Microsoft.Data.SqlClient;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;

namespace AgroScan.Services
{
    public class JwtService
    {
        private readonly IConfiguration _config;

        public JwtService(IConfiguration config) => _config = config;

        private string SecretKey =>
            _config["Jwt:SecretKey"] ?? throw new InvalidOperationException("Jwt:SecretKey nao configurado.");
        private string Issuer => _config["Jwt:Issuer"] ?? "AgroScan";
        private string Audience => _config["Jwt:Audience"] ?? "AgroScanApp";
        private int ExpMin => int.TryParse(_config["Jwt:ExpiracaoMinutos"], out var v) ? v : 60;
        private int RefDays => int.TryParse(_config["Jwt:RefreshExpiracaoDias"], out var v) ? v : 7;

        /// <summary>
        /// Gera AccessToken JWT assinado com HMAC-SHA256.
        /// Claims usam nomes literais do JWT spec para garantir compatibilidade
        /// com TokenValidationParameters.NameClaimType="name" e RoleClaimType="role".
        /// </summary>
        public string GerarAccessToken(Usuario usuario)
        {
            var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(SecretKey));
            var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

            var claims = new[]
            {
                new Claim("sub",  usuario.UsuarioId.ToString()), // UsuarioId
                new Claim("name", usuario.Nome),                  // Nome completo
                new Claim("cpf",  usuario.CPF),                   // CPF
                new Claim("jti",  Guid.NewGuid().ToString()),     // ID unico do token
                new Claim("role", "Produtor")                     // Role (string literal, nao URI)
            };

            var token = new JwtSecurityToken(
                issuer: Issuer,
                audience: Audience,
                claims: claims,
                notBefore: DateTime.UtcNow,
                expires: DateTime.UtcNow.AddMinutes(ExpMin),
                signingCredentials: creds
            );

            return new JwtSecurityTokenHandler().WriteToken(token);
        }

        /// <summary>Gera RefreshToken opaco (256 bits) e persiste no banco com TTL.</summary>
        public string GerarRefreshToken(int usuarioId, string connStr, string ip)
        {
            var bytes = new byte[32];
            using var rng = RandomNumberGenerator.Create();
            rng.GetBytes(bytes);
            var token = Convert.ToBase64String(bytes);

            using var conn = new SqlConnection(connStr);
            const string sql = @"
                INSERT INTO RefreshTokens (UsuarioId, Token, Expiracao, IP)
                VALUES (@uid, @tok, @exp, @ip)";
            using var cmd = new SqlCommand(sql, conn);
            cmd.Parameters.AddWithValue("@uid", usuarioId);
            cmd.Parameters.AddWithValue("@tok", token);
            cmd.Parameters.AddWithValue("@exp", DateTime.UtcNow.AddDays(RefDays));
            cmd.Parameters.AddWithValue("@ip", string.IsNullOrEmpty(ip) ? (object)DBNull.Value : ip);
            conn.Open();
            cmd.ExecuteNonQuery();
            return token;
        }

        /// <summary>Valida RefreshToken; retorna UsuarioId ou null se inválido/expirado/revogado.</summary>
        public int? ValidarRefreshToken(string token, string connStr)
        {
            using var conn = new SqlConnection(connStr);
            const string sql = @"
                SELECT UsuarioId FROM RefreshTokens
                WHERE Token = @tok AND Revogado = 0 AND Expiracao > GETUTCDATE()";
            using var cmd = new SqlCommand(sql, conn);
            cmd.Parameters.AddWithValue("@tok", token);
            conn.Open();
            var result = cmd.ExecuteScalar();
            return result is int uid ? uid : (int?)null;
        }

        /// <summary>Revoga um RefreshToken (logout / rotacao).</summary>
        public void RevogarRefreshToken(string token, string connStr)
        {
            using var conn = new SqlConnection(connStr);
            const string sql = "UPDATE RefreshTokens SET Revogado = 1 WHERE Token = @tok";
            using var cmd = new SqlCommand(sql, conn);
            cmd.Parameters.AddWithValue("@tok", token);
            conn.Open();
            cmd.ExecuteNonQuery();
        }

        /// <summary>
        /// Parâmetros de validação usados pelo middleware JWT Bearer.
        /// Chamado externamente apenas para uso em testes ou validação manual.
        /// </summary>
        public TokenValidationParameters GetValidationParameters() => new()
        {
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(SecretKey)),
            ValidateIssuer = true,
            ValidIssuer = Issuer,
            ValidateAudience = true,
            ValidAudience = Audience,
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromSeconds(30),
            NameClaimType = "name",
            RoleClaimType = "role"
        };
    }
}