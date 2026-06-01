using AgroScan.Models;

namespace AgroScan.Services
{
    /// <summary>
    /// Prompts otimizados para Gemini — notação compacta de schema e KB abreviada.
    /// Ganho vs versão anterior: ~129 tokens/chamada no system prompt.
    ///
    /// Convenções de alias no schema JSON:
    ///   tipos — DF=Doença Fúngica, DB=Doença Bacteriana, VI=Virose,
    ///            PI=Praga de Inseto, PA=Praga de Ácaro, DN=Deficiência Nutricional,
    ///            DAF=Dano Físico, SA=Saudável, IN=Inconclusivo
    ///   nível  — bx=baixa/baixo, md=media/medio, al=alta/alto
    ///   urgência — im=imediata, 48h=em 48h, 7d=em 7 dias, mo=monitorar, ne=nenhuma
    ///
    /// ATENÇÃO: o controller deve expandir os alias antes de retornar ao frontend,
    /// pois o JS e o banco esperam os valores por extenso.
    /// </summary>
    public static class PromptService
    {
        // Mapa de expansão — alias que o Gemini devolve → valor que o frontend/banco espera
        private static readonly Dictionary<string, string> AliasExpansao = new()
        {
            // tipoDiagnostico
            { "DF",  "Doença Fúngica" },
            { "DB",  "Doença Bacteriana" },
            { "VI",  "Virose" },
            { "PI",  "Praga de Inseto" },
            { "PA",  "Praga de Ácaro" },
            { "DN",  "Deficiência Nutricional" },
            { "DAF", "Dano Físico" },
            { "SA",  "Saudável" },
            { "IN",  "Inconclusivo" },
            // gravidade / riscoPropagacao
            { "bx",  "baixa" },
            { "md",  "media" },
            { "al",  "alta" },
            // riscoPropagacao (mesmo alias, mesmo mapa)
            // recomendacaoUrgencia
            { "im",  "imediata" },
            { "48h", "em 48h" },
            { "7d",  "em 7 dias" },
            { "mo",  "monitorar" },
            { "ne",  "nenhuma" },
        };

        /// <summary>Expande os alias do JSON retornado pelo Gemini para os valores completos.</summary>
        public static string ExpandirAliases(string json)
        {
            // Substitui apenas valores de string (entre aspas) que sejam alias exatos
            foreach (var kv in AliasExpansao)
                json = json.Replace($"\"{kv.Key}\"", $"\"{kv.Value}\"");
            return json;
        }

        // KB abreviada — ~178 tokens (era ~251). Legibilidade sacrificada, precisão mantida.
        private const string Kb = @"
F:Míldio(am sup/cz inf),Oídio(pó bco),Requeima(lesões esc+halo am,tom),Botrytis(mofo cz úmido),Fusariose(murcha unilat),Antracnose(lesões dep frutos),Cercospora(manchas circ centro claro).
B:Mancha(lesões úm+halo am),Podridão-mole(fétido),Murcha(exsudato leitoso caule),Cancro.
V:TSWV(bronz,tripes),TMV(mosaico+dist),CMV(bolhos+filif),TYLCV(enroladas,mosca-bca).
P:Mosca-bca(brancos verso+fumagina),Tripes(prateam+rasp),Pulgão(col esverd/pretas+honeydew),Tuta(galerias folhas/frutos),Ácaro-raj(pontil bronze+teia),Ácaro-bronz(bronze caule/folhas,tom).
D:N(am velhas),Fe(clorose internv jovens),Ca(podr apical),K(queima marginal velhas),B(deform pont/frutos).
";

        public static (string systemPrompt, string userText) MontarPromptDiagnostico(AnaliseRequest req)
        {
            var system = $@"Fitopatologista hortaliças BR. Analise sintomas na imagem. JSON puro sem markdown:
{Kb}
{{""tipoDiagnostico"":""DF|DB|VI|PI|PA|DN|DAF|SA|IN"",""nomeDoenca"":""s"",""nomeCientifico"":""s"",""agenteCausador"":""s"",""confianca"":0,""sintomasObservados"":""s"",""condicoesFavoraveis"":""s"",""gravidade"":""bx|md|al"",""gravidadeNivel"":0,""tratamentoPasso1"":""s"",""tratamentoPasso2"":""s"",""tratamentoPasso3"":""s"",""tratamentoEcologico"":""s"",""tratamentoQuimico"":""s"",""prevencao"":""s"",""riscoPropagacao"":""bx|md|al"",""riscoPropagacaoNivel"":0,""plantasAfetadas"":""s"",""recomendacaoUrgencia"":""im|48h|7d|mo|ne"",""diasParaAcao"":0}}
LEGENDA: DF=Doença Fúngica,DB=Doença Bacteriana,VI=Virose,PI=Praga de Inseto,PA=Praga de Ácaro,DN=Deficiência Nutricional,DAF=Dano Físico,SA=Saudável,IN=Inconclusivo. bx=baixa/baixo,md=media/medio,al=alta/alto. im=imediata,48h=em 48h,7d=em 7 dias,mo=monitorar,ne=nenhuma. confianca/gravidadeNivel/riscoPropagacaoNivel/diasParaAcao int.";

            var contexto = MontarContexto(req);
            var userText = string.IsNullOrEmpty(contexto)
                ? "Diagnostique esta hortaliça."
                : $"Diagnostique esta hortaliça.\n\nCONTEXTO:\n{contexto}";

            return (system, userText);
        }

        public static (string systemPrompt, string userText) MontarPromptIdentificacao(AnaliseRequest req)
        {
            var system = @"Agrônomo horticultura BR. Identifique a hortaliça. JSON puro sem markdown:
{""nomeCientifico"":""s"",""nomePopular"":""s"",""familia"":""s"",""categoria"":""fo|fr|ra|bu|le|tu|br"",""cicloVida"":""s"",""diasGerminacao"":0,""diasColheita"":0,""espacamento"":""s"",""clima"":""s"",""temperaturaIdeal"":""s"",""luminosidade"":""s"",""irrigacao"":""s"",""tipoSolo"":""s"",""phIdeal"":""s"",""adubacao"":""s"",""pragasPrincipais"":""s"",""doencasPrincipais"":""s"",""valorNutricional"":""s"",""dicasCultivo"":""s"",""confiancaIdentificacao"":0}
LEGENDA: fo=folhosa,fr=fruto,ra=raiz,bu=bulbo,le=legume,tu=tubérculo,br=brássica. confiancaIdentificacao/diasGerminacao/diasColheita int.";

            var userText = string.IsNullOrWhiteSpace(req.RegiaoClima)
                ? "Identifique esta hortaliça."
                : $"Identifique esta hortaliça. Região: {req.RegiaoClima}.";

            return (system, userText);
        }

        private static string MontarContexto(AnaliseRequest req)
        {
            var p = new List<string>();
            if (!string.IsNullOrWhiteSpace(req.HortalicaNome)) p.Add($"Hortaliça: {req.HortalicaNome}");
            if (!string.IsNullOrWhiteSpace(req.EstagioPlanta)) p.Add($"Estágio: {req.EstagioPlanta}");
            if (!string.IsNullOrWhiteSpace(req.RegiaoClima)) p.Add($"Região: {req.RegiaoClima}");
            if (!string.IsNullOrWhiteSpace(req.CondicoesClimaticas)) p.Add($"Clima: {req.CondicoesClimaticas}");
            if (!string.IsNullOrWhiteSpace(req.SintomasDescricao)) p.Add($"Sintomas: {req.SintomasDescricao}");
            if (!string.IsNullOrWhiteSpace(req.TratamentosAnteriores)) p.Add($"Tratamentos: {req.TratamentosAnteriores}");
            return string.Join("\n", p);
        }
    }
}