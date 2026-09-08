# Privacidade

Não enviar fotos, thumbnails, OCR, localização ou labels pessoais a servidores.
O MVP não exige conta nem backend. Nenhum SDK de analytics está instalado.
O índice futuro guarda somente identificadores, metadata e análise local; nunca cópias das fotos.
O tráfego Metro pertence ao ambiente de desenvolvimento, não ao processamento de fotos.

Antes de remover: intenção → candidatos → preview → seleção → confirmação explícita do usuário
→ API do SO → lixeira quando disponível. A UI não remove itens sem seleção e confirmação;
exclusão permanente continua desativada.
Não logar conteúdo pessoal. A biblioteca do usuário não é fixture de teste.

Android desativa backup automático e bloqueia WRITE_EXTERNAL_STORAGE pelo app config.
Antes de alimentar o índice com dados pessoais, validar também exclusão de backup iOS.
Nenhum asset/OCR é importado nesta etapa.
