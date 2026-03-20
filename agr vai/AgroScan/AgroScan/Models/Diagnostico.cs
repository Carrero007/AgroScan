namespace AgroScan.Models
{
    public class Diagnostico
    {
        public int DiagnosticoId { get; set; }
        public int? PlantaId { get; set; }          // FK opcional
        public string NomeDoenca { get; set; }
        public string NomeCientifico { get; set; }
        public int Confianca { get; set; }           // 0–100
        public string Tratamento { get; set; }
        public string TratamentoEcologico { get; set; }
        public string RiscoPropagacao { get; set; }  // "baixo" | "medio" | "alto"
        public DateTime DataDiagnostico { get; set; }
    }
}
