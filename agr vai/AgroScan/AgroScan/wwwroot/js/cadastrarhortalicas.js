// DEPRECADO: este CRUD apontava para colunas (QuantidadePlantada,
// DataPlantio, CaminhoImagem...) que nunca existiram na tabela real
// Hortalicas (ver banco.txt) — nunca funcionou em produção.
// A funcionalidade de catálogo de hortaliças agora vive 100% em
// hortalicas.html + js/hortalicas.js + api/hortalicas.
window.location.replace('hortalicas.html');