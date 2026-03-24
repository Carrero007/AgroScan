namespace AgroScan.Models
{
    public class Plantas
    {
        public int PlantaId { get; set; }

        // Campos obrigatórios
        public string NomeCientifico { get; set; } = string.Empty;

        // Nomenclatura
        public string? NomePopular { get; set; }
        public string? OutrosNomes { get; set; }

        // Taxonomia
        public string? Familia { get; set; }
        public string? Genero { get; set; }
        public string? Especie { get; set; }

        // Caracterização
        public string? TipoPlanta { get; set; }
        public string? CicloVida { get; set; }

        // Cultivo
        public string? Clima { get; set; }
        public string? Luminosidade { get; set; }
        public string? Rega { get; set; }
        public string? TipoSolo { get; set; }

        // Origem
        public string? Origem { get; set; }
        public string? RegiaoNativa { get; set; }

        // Épocas
        public string? EpocaPlantio { get; set; }
        public string? EpocaFloracao { get; set; }
        public string? EpocaColheita { get; set; }

        // Atributos booleanos
        public bool EhMedicinal { get; set; }
        public bool EhComestivel { get; set; }
        public bool EhToxica { get; set; }

        // Textos longos
        public string? Usos { get; set; }
        public string? Descricao { get; set; }
        public string? Observacoes { get; set; }

        // Auditoria
        public DateTime? DataCriacao { get; set; }
        public DateTime? DataAtualizacao { get; set; }
    }
}