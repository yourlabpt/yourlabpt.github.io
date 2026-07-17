const test = require('node:test');
const assert = require('node:assert/strict');
const deliveryOs = require('../lib/delivery-os');

test('idea guidance prompt keeps original input and current understanding separate', () => {
  const prompt = deliveryOs.buildIdeaGuidancePrompt({
    originalIdeaText: 'Uma aplicação para simplificar reservas locais.',
    vision: {
      mainIdeaMarkdown: 'Reservas num único lugar.',
      problemMarkdown: 'O processo actual é disperso.',
      targetUsers: ['comerciantes'],
    },
  }, 'interpret', [], 'Ainda não sei como cobrar.');

  assert.match(prompt, /Uma aplicação para simplificar reservas locais/);
  assert.match(prompt, /Reservas num único lugar/);
  assert.match(prompt, /Ainda não sei como cobrar/);
  assert.match(prompt, /APENAS em informação explicitamente fornecida/);
  assert.match(prompt, /no máximo uma pergunta/);
});

test('idea guidance question mode asks for one unknown without filling it', () => {
  const prompt = deliveryOs.buildIdeaGuidancePrompt({ originalIdeaText: 'Quero melhorar entregas.' }, 'question');
  assert.match(prompt, /faz UMA pergunta clara/);
  assert.match(prompt, /Não tentes preencher a lacuna/);
});
