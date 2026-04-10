namespace AgroScan.Models
{
    // ── ENTIDADES ─────────────────────────────────────────────────

    public class Usuario
    {
        public int UsuarioId { get; set; }
        public string CPF { get; set; } = string.Empty;
        public string Nome { get; set; } = string.Empty;
        public string SenhaHash { get; set; } = string.Empty;
        public string? Whatsapp { get; set; }
        public double? Latitude { get; set; }
        public double? Longitude { get; set; }
        public string? TipoProdutor { get; set; }
        public decimal? AreaHectares { get; set; }
        public bool Ativo { get; set; } = true;
        public DateTime DataCriacao { get; set; }
        public DateTime? UltimoLogin { get; set; }
    }

    public class Hortalica
    {
        public int HortalicaId { get; set; }
        public string NomeCientifico { get; set; } = string.Empty;
        public string? NomePopular { get; set; }
        public string? Familia { get; set; }
        public string? Categoria { get; set; }
        public string? CicloVida { get; set; }
        public int? DiasGerminacao { get; set; }
        public int? DiasColheita { get; set; }
        public string? Espacamento { get; set; }
        public string? ProfundidadeSemeio { get; set; }
        public string? Clima { get; set; }
        public decimal? TemperaturaMin { get; set; }
        public decimal? TemperaturaMax { get; set; }
        public string? Luminosidade { get; set; }
        public string? Irrigacao { get; set; }
        public string? NecessidadeAgua { get; set; }
        public string? TipoSolo { get; set; }
        public decimal? PHMin { get; set; }
        public decimal? PHMax { get; set; }
        public string? Adubacao { get; set; }
        public string? PragasPrincipais { get; set; }
        public string? DoencasPrincipais { get; set; }
        public string? Origem { get; set; }
        public string? ValorNutricional { get; set; }
        public string? Observacoes { get; set; }
        public DateTime? DataCriacao { get; set; }
        public DateTime? DataAtualizacao { get; set; }
    }

    public class Diagnostico
    {
        public int DiagnosticoId { get; set; }
        public int? UsuarioId { get; set; }
        public int? HortalicaId { get; set; }
        public string? TipoDiagnostico { get; set; }
        public string? NomeDoenca { get; set; }
        public string? NomeCientifico { get; set; }
        public string? AgenteCausador { get; set; }
        public int Confianca { get; set; }
        public int GravidadeNivel { get; set; }
        public string? Gravidade { get; set; }
        public string? SintomasObservados { get; set; }
        public string? Tratamento { get; set; }
        public string? TratamentoEcologico { get; set; }
        public string? TratamentoQuimico { get; set; }
        public string? Prevencao { get; set; }
        public string? RiscoPropagacao { get; set; }
        public int RiscoPropagacaoNivel { get; set; }
        public string? PlantasAfetadas { get; set; }
        public string? CondicoesFavoraveis { get; set; }
        public double? Latitude { get; set; }
        public double? Longitude { get; set; }
        public DateTime DataDiagnostico { get; set; }
    }

    // ── DTOs de autenticação ─────────────────────────────────────

    public class LoginRequest
    {
        public string CPF { get; set; } = string.Empty;
        public string Senha { get; set; } = string.Empty;
    }

    public class CadastroRequest
    {
        public string Nome { get; set; } = string.Empty;
        public string CPF { get; set; } = string.Empty;
        public string Senha { get; set; } = string.Empty;
        public string? Whatsapp { get; set; }
        public double? Latitude { get; set; }
        public double? Longitude { get; set; }
        public string? TipoProdutor { get; set; }
        public decimal? AreaHectares { get; set; }
    }

    public class AuthResponse
    {
        public string Token { get; set; } = string.Empty;
        public string RefreshToken { get; set; } = string.Empty;
        public DateTime Expiracao { get; set; }
        public string Nome { get; set; } = string.Empty;
        public int UsuarioId { get; set; }
    }

    public class RefreshTokenRequest
    {
        public string RefreshToken { get; set; } = string.Empty;
    }

    // ── DTO de análise (diagnóstico / identificação) ─────────────

    public class AnaliseRequest
    {
        public string ImagemBase64 { get; set; } = string.Empty;
        public string MimeType { get; set; } = "image/jpeg";

        // Contexto agronômico — melhora drasticamente a precisão da IA
        public string? HortalicaNome { get; set; }
        public string? RegiaoClima { get; set; }
        public string? EstagioPlanta { get; set; }
        public string? SintomasDescricao { get; set; }
        public string? CondicoesClimaticas { get; set; }
        public string? TratamentosAnteriores { get; set; }
    }
}