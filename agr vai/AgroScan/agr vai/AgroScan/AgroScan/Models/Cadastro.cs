namespace AgroScan.Models
{
    public class Cadastro
    {
        public string Nome { get; set; } = string.Empty;
        public string CPF { get; set; } = string.Empty;
        public string Senha { get; set; } = string.Empty;
        public string? Whatsapp { get; set; }
        public double? Latitude { get; set; }
        public double? Longitude { get; set; }
    }
}
