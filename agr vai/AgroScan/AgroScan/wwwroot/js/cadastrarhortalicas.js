const API_BASE_URL = 'https://localhost:7041/Hortalica';

function getUsuarioId() {
    const usuarioId = localStorage.getItem('as_uid');
    if (!usuarioId) {
        showNotification('Usuário não identificado. Faça login novamente.', 'error');
        window.location.href = 'login.html';
        return null;
    }
    return parseInt(usuarioId);
}

// -------------------- Funções de modal --------------------
function openAddModal() {
    document.getElementById('addModal').showModal();
}

function openUpdateModal() {
    document.getElementById('updateModal').showModal();
    clearUpdateModal();
}

function openDeleteModal() {
    document.getElementById('deleteModal').showModal();
}

function closeModal(id) {
    document.getElementById(id).close();
    if (id === 'updateModal') {
        clearUpdateModal();
    }
}

// -------------------- Limpeza do modal de atualização --------------------
function clearUpdateModal() {
    document.getElementById('updateId').value = '';
    document.getElementById('updateFields').style.display = 'none';
    document.getElementById('loadingMessage').style.display = 'none';
    document.getElementById('updateButton').disabled = true;

    document.getElementById('updateNome').value = '';
    document.getElementById('updateCategoria').value = '';
    document.getElementById('updateQuantidadePlantada').value = '';
    document.getElementById('updateUnidadeMedida').value = '';
    document.getElementById('updateDataPlantio').value = '';
    document.getElementById('updatePrevisaoColheita').value = '';
    document.getElementById('updateCaminhoImagem').value = '';
    document.getElementById('updateObservacoes').value = '';
}

// -------------------- Buscar hortaliça por ID --------------------
function buscarHortalicaPorId(id) {
    const usuarioId = getUsuarioId();
    if (!usuarioId) return;

    document.getElementById('loadingMessage').style.display = 'block';
    document.getElementById('updateFields').style.display = 'none';
    document.getElementById('updateButton').disabled = true;

    fetch(`${API_BASE_URL}/${usuarioId}/${id}`)
        .then(response => {
            if (response.ok) {
                return response.json();
            } else if (response.status === 404) {
                throw new Error('ID não encontrado');
            } else {
                throw new Error('Erro ao buscar hortaliça');
            }
        })
        .then(hortalica => {
            document.getElementById('updateNome').value = hortalica.nome || '';
            document.getElementById('updateCategoria').value = hortalica.categoria || '';
            document.getElementById('updateQuantidadePlantada').value = hortalica.quantidadePlantada || '';
            document.getElementById('updateUnidadeMedida').value = hortalica.unidadeMedida || '';
            document.getElementById('updateDataPlantio').value = formatDateForInput(hortalica.dataPlantio);
            document.getElementById('updatePrevisaoColheita').value = formatDateForInput(hortalica.previsaoColheita);
            document.getElementById('updateCaminhoImagem').value = hortalica.caminhoImagem || '';
            document.getElementById('updateObservacoes').value = hortalica.observacoes || '';

            document.getElementById('loadingMessage').style.display = 'none';
            document.getElementById('updateFields').style.display = 'block';
            document.getElementById('updateButton').disabled = false;
        })
        .catch(error => {
            console.error('Erro:', error);
            document.getElementById('loadingMessage').style.display = 'none';
            showNotification(error.message, 'error');
        });
}

function formatDateForInput(dateValue) {
    if (!dateValue) return '';
    const date = new Date(dateValue);
    if (isNaN(date.getTime())) return '';
    return date.toISOString().split('T')[0];
}

// -------------------- Event listeners --------------------
document.addEventListener('DOMContentLoaded', function () {
    const updateIdInput = document.getElementById('updateId');
    let timeoutId;

    updateIdInput.addEventListener('input', function () {
        const id = this.value.trim();

        if (timeoutId) {
            clearTimeout(timeoutId);
        }

        if (id === '' || !/^\d+$/.test(id)) {
            document.getElementById('updateFields').style.display = 'none';
            document.getElementById('loadingMessage').style.display = 'none';
            document.getElementById('updateButton').disabled = true;
            return;
        }

        timeoutId = setTimeout(() => {
            buscarHortalicaPorId(parseInt(id));
        }, 800);
    });

    const modals = document.querySelectorAll('dialog');
    modals.forEach(modal => {
        modal.addEventListener('click', function (event) {
            if (event.target === modal) {
                modal.close();
                if (modal.id === 'updateModal') {
                    clearUpdateModal();
                }
            }
        });
    });

    // Carrega os dados ao abrir a página
    getHortalicas();
});

// -------------------- CRUD --------------------
function getHortalicas() {
    const usuarioId = getUsuarioId();
    if (!usuarioId) return;

    const table = document.getElementById('hortalicasTable');
    table.classList.add('table-loading');

    fetch(`${API_BASE_URL}/${usuarioId}`)
        .then(response => response.json())
        .then(data => {
            const tbody = document.querySelector('#hortalicasTable tbody');
            tbody.innerHTML = '';

            if (data.length === 0) {
                const row = document.createElement('tr');
                row.innerHTML = '<td colspan="10" class="empty-state">Nenhuma hortaliça cadastrada ainda. Que tal adicionar a primeira?</td>';
                tbody.appendChild(row);
            } else {
                data.forEach((hortalica, index) => {
                    const row = document.createElement('tr');
                    row.style.animationDelay = `${index * 0.1}s`;

                    addCell(row, hortalica.id, 'ID');
                    addCell(row, hortalica.nome, 'Nome');
                    addCell(row, hortalica.categoria || '-', 'Categoria');
                    addCell(row, hortalica.quantidadePlantada != null ? hortalica.quantidadePlantada : '-', 'Qtd. Plantada');
                    addCell(row, hortalica.unidadeMedida || '-', 'Unidade');
                    addCell(row, hortalica.dataPlantio ? formatDateForInput(hortalica.dataPlantio) : '-', 'Data Plantio');
                    addCell(row, hortalica.previsaoColheita ? formatDateForInput(hortalica.previsaoColheita) : '-', 'Previsão Colheita');

                    const imagemCell = document.createElement('td');
                    imagemCell.setAttribute('data-label', 'Imagem');
                    if (hortalica.caminhoImagem) {
                        const img = document.createElement('img');
                        img.src = hortalica.caminhoImagem;
                        img.alt = hortalica.nome;
                        imagemCell.appendChild(img);
                    } else {
                        imagemCell.textContent = 'Sem imagem';
                    }
                    row.appendChild(imagemCell);

                    addCell(row, hortalica.observacoes || 'Sem observações', 'Observações');

                    const actionsCell = document.createElement('td');
                    actionsCell.setAttribute('data-label', 'Ações');
                    const deleteButton = document.createElement('button');
                    deleteButton.classList.add('btn-delete');
                    deleteButton.textContent = 'Excluir';
                    deleteButton.addEventListener('click', () => deleteHortalica(hortalica.id));
                    actionsCell.appendChild(deleteButton);
                    row.appendChild(actionsCell);

                    tbody.appendChild(row);
                });
            }

            table.classList.remove('table-loading');
        })
        .catch(error => {
            console.error('Erro ao carregar hortaliças:', error);
            table.classList.remove('table-loading');
        });
}

function addCell(row, text, label) {
    const cell = document.createElement('td');
    cell.textContent = text;
    cell.setAttribute('data-label', label);
    row.appendChild(cell);
}

function addHortalica(event) {
    event.preventDefault();
    const usuarioId = getUsuarioId();
    if (!usuarioId) return;

    const hortalica = {
        usuarioId: usuarioId,
        nome: document.getElementById('nome').value,
        categoria: document.getElementById('categoria').value,
        quantidadePlantada: parseFloat(document.getElementById('quantidadePlantada').value) || null,
        unidadeMedida: document.getElementById('unidadeMedida').value,
        dataPlantio: document.getElementById('dataPlantio').value || null,
        previsaoColheita: document.getElementById('previsaoColheita').value || null,
        caminhoImagem: document.getElementById('caminhoImagem').value,
        observacoes: document.getElementById('observacoes').value
    };

    fetch(API_BASE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(hortalica)
    })
        .then(response => {
            if (response.ok) {
                closeModal('addModal');
                getHortalicas();
                showNotification('Hortaliça adicionada com sucesso!', 'success');
                document.getElementById('addHortalicaForm').reset();
            } else {
                showNotification('Erro ao adicionar hortaliça.', 'error');
            }
        })
        .catch(error => {
            console.error('Erro:', error);
            showNotification('Erro de conexão.', 'error');
        });
}

function updateHortalica(event) {
    event.preventDefault();
    const usuarioId = getUsuarioId();
    if (!usuarioId) return;

    const id = parseInt(document.getElementById('updateId').value);
    const hortalica = {
        usuarioId: usuarioId,
        nome: document.getElementById('updateNome').value,
        categoria: document.getElementById('updateCategoria').value,
        quantidadePlantada: parseFloat(document.getElementById('updateQuantidadePlantada').value) || null,
        unidadeMedida: document.getElementById('updateUnidadeMedida').value,
        dataPlantio: document.getElementById('updateDataPlantio').value || null,
        previsaoColheita: document.getElementById('updatePrevisaoColheita').value || null,
        caminhoImagem: document.getElementById('updateCaminhoImagem').value,
        observacoes: document.getElementById('updateObservacoes').value
    };

    fetch(`${API_BASE_URL}/${id}?usuarioId=${usuarioId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(hortalica)
    })
        .then(response => {
            if (response.ok) {
                closeModal('updateModal');
                getHortalicas();
                showNotification('Hortaliça atualizada com sucesso!', 'success');
                document.getElementById('updateHortalicaForm').reset();
                clearUpdateModal();
            } else if (response.status === 404) {
                showNotification('ID não encontrado para atualização.', 'error');
            } else {
                showNotification('Erro ao atualizar hortaliça.', 'error');
            }
        })
        .catch(error => {
            console.error('Erro:', error);
            showNotification('Erro de conexão.', 'error');
        });
}

function deleteHortalica(id) {
    const usuarioId = getUsuarioId();
    if (!usuarioId) return;

    if (!confirm('Tem certeza que deseja excluir esta hortaliça?')) {
        return;
    }

    fetch(`${API_BASE_URL}/${id}?usuarioId=${usuarioId}`, { method: 'DELETE' })
        .then(response => {
            if (response.ok) {
                getHortalicas();
                showNotification('Hortaliça excluída com sucesso!', 'success');
            } else if (response.status === 404) {
                showNotification('ID não encontrado para exclusão.', 'error');
            } else {
                showNotification('Erro ao excluir hortaliça.', 'error');
            }
        })
        .catch(error => {
            console.error('Erro:', error);
            showNotification('Erro de conexão.', 'error');
        });
}

// -------------------- Notificações --------------------
function showNotification(message, type) {
    const existingNotification = document.querySelector('.notification');
    if (existingNotification) {
        existingNotification.remove();
    }

    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// -------------------- Eventos de formulário --------------------
document.getElementById('addHortalicaForm').addEventListener('submit', addHortalica);
document.getElementById('updateHortalicaForm').addEventListener('submit', updateHortalica);
document.getElementById('deleteHortalicaForm').addEventListener('submit', event => {
    event.preventDefault();
    const id = parseInt(document.getElementById('deleteId').value);
    deleteHortalica(id);
    closeModal('deleteModal');
});