-- ═══════════════════════════════════════════════════════════════
-- AgroScan — Sistema Inteligente para Diagnóstico de Pragas e
-- Doenças em Hortaliças
-- Schema v2.0 — com suporte a JWT, auditoria e dados detalhados
-- ═══════════════════════════════════════════════════════════════

-- 1. USUÁRIOS (substitui tabela Login genérica)
CREATE TABLE [dbo].[Usuarios] (
    [UsuarioId]      INT           IDENTITY(1,1) NOT NULL,
    [CPF]            VARCHAR(11)   NOT NULL,
    [Nome]           VARCHAR(100)  NOT NULL DEFAULT '',
    [SenhaHash]      VARCHAR(256)  NOT NULL,  -- BCrypt hash, nunca plain text
    [Whatsapp]       VARCHAR(20)   NULL,
    [Latitude]       FLOAT         NULL,
    [Longitude]      FLOAT         NULL,
    [TipoProdutor]   VARCHAR(50)   NULL,      -- 'familiar','comercial','cooperativa'
    [AreaHectares]   DECIMAL(10,2) NULL,
    [Ativo]          BIT           DEFAULT 1 NOT NULL,
    [DataCriacao]    DATETIME      DEFAULT GETDATE() NOT NULL,
    [UltimoLogin]    DATETIME      NULL,
    CONSTRAINT PK_Usuarios PRIMARY KEY CLUSTERED ([UsuarioId] ASC),
    CONSTRAINT UQ_Usuarios_CPF UNIQUE ([CPF])
);

-- 2. REFRESH TOKENS (para renovação JWT sem re-login)
CREATE TABLE [dbo].[RefreshTokens] (
    [Id]          INT           IDENTITY(1,1) NOT NULL,
    [UsuarioId]   INT           NOT NULL,
    [Token]       VARCHAR(512)  NOT NULL,
    [Expiracao]   DATETIME      NOT NULL,
    [Revogado]    BIT           DEFAULT 0 NOT NULL,
    [CriadoEm]    DATETIME      DEFAULT GETDATE() NOT NULL,
    [IP]          VARCHAR(45)   NULL,
    CONSTRAINT PK_RefreshTokens PRIMARY KEY ([Id]),
    CONSTRAINT FK_RefreshTokens_Usuarios FOREIGN KEY ([UsuarioId])
        REFERENCES [dbo].[Usuarios]([UsuarioId]) ON DELETE CASCADE
);

-- 3. HORTALIÇAS (foco exclusivo em hortaliças)
CREATE TABLE [dbo].[Hortalicas] (
    [HortalicaId]       INT            IDENTITY(1,1) NOT NULL,
    [NomeCientifico]    NVARCHAR(255)  NOT NULL,
    [NomePopular]       NVARCHAR(255)  NULL,
    [Familia]           NVARCHAR(100)  NULL,       -- Solanaceae, Cucurbitaceae, etc.
    [Categoria]         NVARCHAR(50)   NULL,        -- 'folhosa','fruto','raiz','bulbo','legume'
    [CicloVida]         NVARCHAR(50)   NULL,        -- 'curto','medio','longo'
    [DiasGerminacao]    INT            NULL,
    [DiasColheita]      INT            NULL,
    [Espacamento]       NVARCHAR(100)  NULL,
    [ProfundidadeSemeio] NVARCHAR(50)  NULL,
    [Clima]             NVARCHAR(100)  NULL,
    [TemperaturaMin]    DECIMAL(4,1)   NULL,
    [TemperaturaMax]    DECIMAL(4,1)   NULL,
    [Luminosidade]      NVARCHAR(100)  NULL,
    [Irrigacao]         NVARCHAR(100)  NULL,        -- 'gotejamento','aspersao','manual'
    [NecessidadeAgua]   NVARCHAR(50)   NULL,        -- 'baixa','media','alta'
    [TipoSolo]          NVARCHAR(255)  NULL,
    [PHMin]             DECIMAL(3,1)   NULL,
    [PHMax]             DECIMAL(3,1)   NULL,
    [Adubacao]          NVARCHAR(MAX)  NULL,
    [PragasPrincipais]  NVARCHAR(MAX)  NULL,        -- JSON array com principais pragas
    [DoencasPrincipais] NVARCHAR(MAX)  NULL,        -- JSON array com principais doenças
    [Origem]            NVARCHAR(255)  NULL,
    [ValorNutricional]  NVARCHAR(MAX)  NULL,
    [Observacoes]       NVARCHAR(MAX)  NULL,
    [DataCriacao]       DATETIME       DEFAULT GETDATE() NULL,
    [DataAtualizacao]   DATETIME       NULL,
    CONSTRAINT PK_Hortalicas PRIMARY KEY CLUSTERED ([HortalicaId] ASC)
);

-- 4. DIAGNÓSTICOS (enriquecido com campos específicos de hortaliças)
CREATE TABLE [dbo].[Diagnosticos] (
    [DiagnosticoId]          INT            IDENTITY(1,1) NOT NULL,
    [UsuarioId]              INT            NULL,
    [HortalicaId]            INT            NULL,
    [TipoDiagnostico]        NVARCHAR(80)   NULL,   -- 'Doença Fúngica', 'Praga de Inseto', etc.
    [NomeDoenca]             NVARCHAR(200)  NULL,
    [NomeCientifico]         NVARCHAR(200)  NULL,
    [AgenteCausador]         NVARCHAR(200)  NULL,
    [Confianca]              INT            NULL,    -- 0-100
    [GravidadeNivel]         INT            NULL,    -- 0-10
    [Gravidade]              NVARCHAR(20)   NULL,    -- 'baixa','media','alta'
    [SintomasObservados]     NVARCHAR(MAX)  NULL,
    [Tratamento]             NVARCHAR(MAX)  NULL,
    [TratamentoEcologico]    NVARCHAR(MAX)  NULL,
    [TratamentoQuimico]      NVARCHAR(MAX)  NULL,
    [Prevencao]              NVARCHAR(MAX)  NULL,
    [RiscoPropagacao]        NVARCHAR(20)   NULL,    -- 'baixo','medio','alto'
    [RiscoPropagacaoNivel]   INT            NULL,    -- 0-10
    [PlantasAfetadas]        NVARCHAR(MAX)  NULL,
    [CondicoesFavoraveis]    NVARCHAR(MAX)  NULL,
    [ImagemBase64]           NVARCHAR(MAX)  NULL,   -- opcional: salvar imagem diagnóstico
    [Latitude]               FLOAT          NULL,
    [Longitude]              FLOAT          NULL,
    [DataDiagnostico]        DATETIME       DEFAULT GETDATE() NULL,
    CONSTRAINT PK_Diagnosticos PRIMARY KEY CLUSTERED ([DiagnosticoId] ASC),
    CONSTRAINT FK_Diag_Usuarios  FOREIGN KEY ([UsuarioId])  REFERENCES [dbo].[Usuarios]([UsuarioId]),
    CONSTRAINT FK_Diag_Hortalica FOREIGN KEY ([HortalicaId]) REFERENCES [dbo].[Hortalicas]([HortalicaId])
);

-- 5. LOG DE AUDITORIA (rastreia chamadas à IA)
CREATE TABLE [dbo].[AuditLog] (
    [LogId]       INT           IDENTITY(1,1) NOT NULL,
    [UsuarioId]   INT           NULL,
    [Acao]        VARCHAR(100)  NOT NULL,   -- 'diagnosticar','identificar','salvar', etc.
    [IP]          VARCHAR(45)   NULL,
    [Modelo]      VARCHAR(100)  NULL,       -- modelo Groq usado
    [TokensUsados] INT          NULL,
    [CriadoEm]   DATETIME      DEFAULT GETDATE() NOT NULL,
    CONSTRAINT PK_AuditLog PRIMARY KEY ([LogId])
);

-- ÍNDICES de performance
CREATE INDEX IX_Diagnosticos_UsuarioId    ON [dbo].[Diagnosticos]([UsuarioId]);
CREATE INDEX IX_Diagnosticos_Data         ON [dbo].[Diagnosticos]([DataDiagnostico] DESC);
CREATE INDEX IX_RefreshTokens_Token       ON [dbo].[RefreshTokens]([Token]);
CREATE INDEX IX_Usuarios_CPF              ON [dbo].[Usuarios]([CPF]);
