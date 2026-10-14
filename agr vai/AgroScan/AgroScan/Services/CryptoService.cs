using System.Security.Cryptography;
using System.Text;

namespace AgroScan.Services
{
    public class CryptoService
    {
        private readonly IConfiguration _config;
        private byte[]? _key;
        public CryptoService(IConfiguration config) => _config = config;

        // Carrega só no primeiro uso: sem config, o resto do sistema continua funcionando.
        private byte[] Key => _key ??= Carregar();
        private byte[] Carregar()
        {
            var b64 = _config["Security:ChaveCriptografia"];
            if (string.IsNullOrWhiteSpace(b64))
                throw new InvalidOperationException("Security:ChaveCriptografia nao configurada.");
            var k = Convert.FromBase64String(b64);
            if (k.Length != 32) throw new InvalidOperationException("ChaveCriptografia deve ter 32 bytes (base64).");
            return k;
        }

        public string Encrypt(string plain)
        {
            var nonce = RandomNumberGenerator.GetBytes(12);
            var pt = Encoding.UTF8.GetBytes(plain);
            var ct = new byte[pt.Length];
            var tag = new byte[16];
            using var aes = new AesGcm(Key, 16);
            aes.Encrypt(nonce, pt, ct, tag);
            return Convert.ToBase64String(nonce.Concat(tag).Concat(ct).ToArray());
        }

        public string Decrypt(string cipher)
        {
            var all = Convert.FromBase64String(cipher);
            var nonce = all[..12]; var tag = all[12..28]; var ct = all[28..];
            var pt = new byte[ct.Length];
            using var aes = new AesGcm(Key, 16);
            aes.Decrypt(nonce, ct, tag, pt);
            return Encoding.UTF8.GetString(pt);
        }
    }
}