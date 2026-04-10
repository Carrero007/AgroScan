using AgroScan.Models;

namespace AgroScan.Services
{
    /// <summary>
    /// Prompts especializados para diagnóstico de pragas e doenças em hortaliças.
    /// 
    /// IMPORTANTE sobre limites do Groq Vision (llama-4-scout):
    /// - Context window total: 8192 tokens
    /// - Imagem consome tokens por patches visuais (~256 tokens por patch 512x512)
    /// - System prompt deve ser enxuto para não estoura o limite
    /// - KnowledgeBase foi compactada para caber junto com a imagem
    /// </summary>
    public static class PromptService
    {
        // KnowledgeBase compacta — mantém informação essencial em ~400 tokens
        // para caber confortavelmente junto com a imagem no context window do Groq
        private const string KbCompacta = @"
DOENÇAS FÚNGICAS: Míldio (mancha amarela face sup, mofo cinza inf), Oídio (pó branco), Requeima/Pinta-preta (lesões escuras halo amarelo, tomate), Botrytis (mofo cinza úmido), Fusariose (murcha unilateral), Antracnose (lesões deprimidas escuras frutos), Cercospora (manchas circulares centro claro).
DOENÇAS BACTERIANAS: Mancha bacteriana (lesões úmidas halo amarelo), Podridão-mole (odor fétido), Murcha bacteriana (exsudato leitoso no corte do caule), Cancro bacteriano.
VIROSES: TSWV (bronzeamento manchas, vetor tripes), TMV (mosaico distorção), CMV (bolhosidade filiformismo), TYLCV (folhas enroladas, vetor mosca-branca).
PRAGAS: Mosca-branca (insetos brancos no verso, fumagina), Tripes (prateamento raspagem ponteiros), Pulgão (colônias esverdeadas/pretas honeydew), Tuta absoluta (galerias folhas e frutos), Ácaro-rajado (pontilhado bronze teia seca), Ácaro-do-bronzeamento (caule folhas bronze em tomate).
DEFICIÊNCIAS: N (amarelo folhas velhas), Fe (clorose internerval folhas jovens), Ca (podridão apical ou tip burn), K (queima marginal folhas velhas), B (deformação ponteiros frutos).
";

        /// <summary>
        /// Prompt de diagnóstico compacto — cabe dentro do limite de tokens do Groq Vision.
        /// A base de conhecimento é fornecida de forma concisa no system prompt.
        /// O contexto do produtor vai no user message para máximo aproveitamento.
        /// </summary>
        public static (string systemPrompt, string userText) MontarPromptDiagnostico(AnaliseRequest req)
        {
            // System prompt: papel + conhecimento compacto + regras de saída
            var system = $@"Você é fitopatologista especialista em hortaliças brasileiras.
{KbCompacta}
Analise a imagem observando: localização dos sintomas, padrão, cor, textura das lesões, insetos visíveis, distribuição.
Responda APENAS JSON válido sem markdown:
{{""tipoDiagnostico"":""string"",""nomeDoenca"":""string"",""nomeCientifico"":""string"",""agenteCausador"":""string"",""confianca"":0,""sintomasObservados"":""string"",""sintomasTipicos"":""string"",""condicoesFavoraveis"":""string"",""gravidade"":""string"",""gravidadeNivel"":0,""tratamentoPasso1"":""string"",""tratamentoPasso2"":""string"",""tratamentoPasso3"":""string"",""tratamentoEcologico"":""string"",""tratamentoQuimico"":""string"",""prevencao"":""string"",""riscoPropagacao"":""string"",""riscoPropagacaoNivel"":0,""riscoPropagacaoTexto"":""string"",""plantasAfetadas"":""string"",""recomendacaoUrgencia"":""string"",""diasParaAcao"":0}}
REGRAS: tipoDiagnostico deve ser exatamente um de: Doença Fúngica|Doença Bacteriana|Virose|Praga de Inseto|Praga de Ácaro|Deficiência Nutricional|Dano Físico|Saudável|Inconclusivo. confianca 0-100 (int). gravidadeNivel 0-10 (int). gravidade: baixa|media|alta. riscoPropagacao: baixo|medio|alto. riscoPropagacaoNivel 0-10 (int). recomendacaoUrgencia: imediata|em 48h|em 7 dias|monitorar|nenhuma. diasParaAcao int.";

            // User text: contexto do produtor (vai junto com a imagem no user message)
            var contexto = MontarContextoUsuario(req);
            var userText = string.IsNullOrEmpty(contexto)
                ? "Diagnostique esta hortaliça."
                : $"Diagnostique esta hortaliça.\n\nCONTEXTO DO PRODUTOR:\n{contexto}";

            return (system, userText);
        }

        /// <summary>
        /// Prompt de identificação de hortaliça.
        /// </summary>
        public static (string systemPrompt, string userText) MontarPromptIdentificacao(AnaliseRequest req)
        {
            var system = @"Você é agrônomo especialista em horticultura brasileira.
Identifique a hortaliça na imagem e forneça dados agronômicos práticos.
Responda APENAS JSON válido sem markdown:
{""nomeCientifico"":""string"",""nomePopular"":""string"",""familia"":""string"",""categoria"":""string"",""cicloVida"":""string"",""diasGerminacao"":0,""diasColheita"":0,""espacamento"":""string"",""clima"":""string"",""temperaturaIdeal"":""string"",""luminosidade"":""string"",""irrigacao"":""string"",""tipoSolo"":""string"",""phIdeal"":""string"",""adubacao"":""string"",""pragasPrincipais"":""string"",""doencasPrincipais"":""string"",""valorNutricional"":""string"",""dicasCultivo"":""string"",""confiancaIdentificacao"":0}
REGRAS: confiancaIdentificacao 0-100 (int). diasGerminacao e diasColheita int. categoria: folhosa|fruto|raiz|bulbo|legume|tubérculo|brássica.";

            var contexto = string.IsNullOrWhiteSpace(req.RegiaoClima)
                ? "Identifique esta hortaliça."
                : $"Identifique esta hortaliça. Região do produtor: {req.RegiaoClima}.";

            return (system, contexto);
        }

        private static string MontarContextoUsuario(AnaliseRequest req)
        {
            var partes = new List<string>();
            if (!string.IsNullOrWhiteSpace(req.HortalicaNome)) partes.Add($"Hortaliça: {req.HortalicaNome}");
            if (!string.IsNullOrWhiteSpace(req.EstagioPlanta)) partes.Add($"Estágio: {req.EstagioPlanta}");
            if (!string.IsNullOrWhiteSpace(req.RegiaoClima)) partes.Add($"Região/Clima: {req.RegiaoClima}");
            if (!string.IsNullOrWhiteSpace(req.CondicoesClimaticas)) partes.Add($"Clima recente: {req.CondicoesClimaticas}");
            if (!string.IsNullOrWhiteSpace(req.SintomasDescricao)) partes.Add($"Sintomas: {req.SintomasDescricao}");
            if (!string.IsNullOrWhiteSpace(req.TratamentosAnteriores)) partes.Add($"Tratamentos anteriores: {req.TratamentosAnteriores}");
            return string.Join("\n", partes);
        }
    }
}