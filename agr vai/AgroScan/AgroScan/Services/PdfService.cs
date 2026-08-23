using AgroScan.Models;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace AgroScan.Services
{
    /// <summary>
    /// Gera o PDF do relatório de diagnóstico no servidor — necessário para
    /// anexar em e-mail (Brevo) e para hospedar temporariamente (link do
    /// WhatsApp). Espelha o layout que já existia no client (jsPDF em
    /// historico.js), mas em C# para poder ser gerado sem navegador.
    /// </summary>
    public static class PdfService
    {
        static PdfService()
        {
            QuestPDF.Settings.License = LicenseType.Community;
        }

        public static byte[] GerarPdfDiagnostico(Diagnostico d, string nomeUsuario)
        {
            var documento = Document.Create(container =>
            {
                container.Page(page =>
                {
                    page.Size(PageSizes.A4);
                    page.Margin(30);
                    page.DefaultTextStyle(x => x.FontSize(10));

                    page.Header().Column(col =>
                    {
                        col.Item().Text("AgroScan — Relatório de Diagnóstico")
                            .FontSize(16).Bold().FontColor("#2a2a24");
                        col.Item().PaddingTop(4).LineHorizontal(1).LineColor("#5a8a6a");
                    });

                    page.Content().PaddingTop(15).Column(col =>
                    {
                        col.Item().Text(d.NomeDoenca ?? "Diagnóstico").FontSize(18).Bold();
                        col.Item().Text(d.NomeCientifico ?? "—").FontSize(10).Italic().FontColor("#7a7060");

                        col.Item().PaddingTop(6).Text(
                            $"{d.TipoDiagnostico ?? "—"}   ·   Gravidade: {TraduzGravidade(d.Gravidade)}   ·   Risco de propagação: {TraduzRisco(d.RiscoPropagacao)}"
                        ).FontSize(10).FontColor("#5a8a6a");

                        void Secao(string titulo, string? texto)
                        {
                            col.Item().PaddingTop(12).Text(titulo.ToUpper()).FontSize(9).Bold().FontColor("#5a8a6a");
                            col.Item().PaddingTop(2).Text(string.IsNullOrWhiteSpace(texto) ? "—" : texto).FontSize(10.5f);
                        }

                        Secao("Agente causador", d.AgenteCausador);
                        Secao("Sintomas observados", d.SintomasObservados);
                        Secao("Tratamento ecológico", d.TratamentoEcologico);
                        Secao("Tratamento químico", d.TratamentoQuimico);
                        Secao("Prevenção", d.Prevencao);
                        Secao("Plantas afetadas / Propagação", d.PlantasAfetadas);

                        col.Item().PaddingTop(16).Row(row =>
                        {
                            row.RelativeItem().Column(c =>
                            {
                                c.Item().Text("CONFIANÇA DA IA").FontSize(9).Bold().FontColor("#5a8a6a");
                                c.Item().Text($"{d.Confianca}%").FontSize(18);
                            });
                            row.RelativeItem().Column(c =>
                            {
                                c.Item().Text("DATA DO DIAGNÓSTICO").FontSize(9).Bold().FontColor("#5a8a6a");
                                c.Item().Text(d.DataDiagnostico.ToString("dd/MM/yyyy HH:mm")).FontSize(11);
                            });
                        });
                    });

                    page.Footer().AlignCenter().Text(text =>
                    {
                        text.Span($"Gerado por AgroScan em {DateTime.Now:dd/MM/yyyy HH:mm} · Produtor: {nomeUsuario}")
                            .FontSize(8).FontColor("#999999");
                    });
                });
            });

            return documento.GeneratePdf();
        }

        private static string TraduzGravidade(string? g) =>
            g switch { "alta" => "Alta", "media" => "Média", "baixa" => "Baixa", _ => "—" };

        private static string TraduzRisco(string? r) =>
            r switch { "alto" => "Alto", "medio" => "Médio", "baixo" => "Baixo", _ => "—" };
    }
}