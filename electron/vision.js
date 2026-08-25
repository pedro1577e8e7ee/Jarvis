const { desktopCapturer, screen } = require('electron');
const { getApiKeyStatus } = require('./settings');

async function capturePrimaryScreen() {
  const status = await getApiKeyStatus();
  if (!status.allowScreenCapture) {
    throw new Error('A visao de tela esta desligada. Autorize-a nas configuracoes primeiro.');
  }

  const display = screen.getPrimaryDisplay();
  const width = Math.min(Math.max(display.size.width, 1024), 1920);
  const height = Math.min(Math.max(display.size.height, 576), 1080);
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width, height },
    fetchWindowIcons: false,
  });
  const source = sources[0];
  if (!source || source.thumbnail.isEmpty()) {
    throw new Error('Nao foi possivel capturar a tela principal.');
  }

  const png = source.thumbnail.toPNG();
  return {
    dataUrl: 'data:image/png;base64,' + png.toString('base64'),
    width: source.thumbnail.getSize().width,
    height: source.thumbnail.getSize().height,
  };
}

module.exports = { capturePrimaryScreen };
