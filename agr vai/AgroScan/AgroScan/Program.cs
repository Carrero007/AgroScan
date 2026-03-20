var builder = WebApplication.CreateBuilder(args);

// Servicos
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();

// Swagger com suporte a upload de arquivo (IFormFile)
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new Microsoft.OpenApi.Models.OpenApiInfo
    {
        Title = "AgroScan API",
        Version = "v1"
    });

    c.MapType<IFormFile>(() => new Microsoft.OpenApi.Models.OpenApiSchema
    {
        Type = "string",
        Format = "binary"
    });
});

// HttpClient necessario para o GroqController chamar a API da Groq
builder.Services.AddHttpClient();

// CORS registrado antes do builder.Build()
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll", policy =>
        policy.AllowAnyHeader()
              .AllowAnyOrigin()
              .AllowAnyMethod());
});

// Limite de upload: 15 MB
builder.Services.Configure<Microsoft.AspNetCore.Http.Features.FormOptions>(options =>
{
    options.MultipartBodyLengthLimit = 15 * 1024 * 1024;
});

var app = builder.Build();

// Pipeline de middleware - A ORDEM IMPORTA

// 1. CORS deve vir primeiro
app.UseCors("AllowAll");

// 2. Swagger apenas em desenvolvimento
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(c =>
    {
        c.SwaggerEndpoint("/swagger/v1/swagger.json", "AgroScan API v1");
        c.RoutePrefix = "swagger";
    });
}

// 3. HTTPS
app.UseHttpsRedirection();

// 4. Arquivos estaticos (wwwroot - HTMLs, CSS, JS)
app.UseDefaultFiles();
app.UseStaticFiles();

// 5. Auth e controllers
app.UseAuthorization();
app.MapControllers();

app.Run();