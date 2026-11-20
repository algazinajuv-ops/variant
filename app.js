const byId = id => document.getElementById(id);
const form = byId('generate-form');
const fileInput = byId('file');
const drop = byId('drop');
const sourceText = byId('source-text');
const settings = byId('settings');
const keyInput = byId('key');
const result = byId('result');
const fileTypes = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  webp: 'image/webp', pdf: 'application/pdf', txt: 'text/plain'
};
const limit = 10 * 1024 * 1024;
let mode = 'file';
let selectedFile;
let thumbnailUrl;
let personalKey = '';
let serverReady = false;
let activeRequest;

const example = {
  title: 'Алгебра · тренировочный пример',
  topics: ['Линейные уравнения', 'Раскрытие скобок'],
  tasks: [
    { question: 'Реши уравнение 4x − 9 = 2x + 7.', answer: 'x = 8', solution: 'Перенеси 2x влево, а −9 вправо. Получится 2x = 16. Раздели обе части на 2.' },
    { question: 'Раскрой скобки и приведи подобные слагаемые: 3(2a − 5) − 4(a + 1).', answer: '2a − 19', solution: 'Раскрой скобки: 6a − 15 − 4a − 4. Сложи слагаемые с a и отдельно сложи числа.' },
    { question: 'Реши уравнение 2(3x − 4) = 4x + 10.', answer: 'x = 9', solution: 'После раскрытия скобок получаем 6x − 8 = 4x + 10. Собери слагаемые: 2x = 18.' }
  ]
};

const ready = fetch('/api/config').then(async response => {
  if (response.ok) serverReady = Boolean((await response.json()).configured);
}).catch(() => {});

function message(element, value = '') {
  element.textContent = value;
  element.hidden = !value;
}

function switchMode(next) {
  mode = next;
  byId('file-mode').setAttribute('aria-pressed', String(next === 'file'));
  byId('text-mode').setAttribute('aria-pressed', String(next === 'text'));
  byId('file-panel').hidden = next !== 'file';
  byId('text-panel').hidden = next !== 'text';
  message(byId('error'));
}

function fileType(file) {
  const extension = file.name.split('.').pop().toLowerCase();
  return Object.hasOwn(fileTypes, extension) ? fileTypes[extension] : '';
}

function setFile(file) {
  const type = file && fileType(file);
  if (file && (!type || !file.size || file.size > limit)) {
    fileInput.value = '';
    message(byId('error'), 'Выбери непустой JPG, PNG, WEBP, PDF или TXT размером до 10 МБ.');
    return;
  }
  if (thumbnailUrl) URL.revokeObjectURL(thumbnailUrl);
  thumbnailUrl = undefined;
  selectedFile = file;
  if (!file) fileInput.value = '';
  byId('file-row').hidden = !file;
  const preview = byId('thumbnail');
  preview.removeAttribute('src');
  preview.hidden = !type?.startsWith('image/');
  if (file) {
    byId('file-name').textContent = file.name;
    byId('file-size').textContent = file.size >= 1024 * 1024
      ? `${(file.size / (1024 * 1024)).toFixed(1)} МБ`
      : `${Math.max(1, Math.round(file.size / 1024))} КБ`;
    if (!preview.hidden) {
      thumbnailUrl = URL.createObjectURL(new Blob([file], { type }));
      preview.src = thumbnailUrl;
    }
  }
  message(byId('error'));
}

function showSettings() {
  message(byId('key-error'));
  keyInput.value = '';
  keyInput.placeholder = personalKey ? 'Ключ сохранён в этой вкладке' : 'sk-…';
  byId('clear-key').hidden = !personalKey;
  byId('key-help').textContent = serverReady
    ? 'На сайте уже настроен ИИ. Здесь можно указать свой ключ для запросов. OpenAI может взимать плату за запросы.'
    : 'Для генерации нужен ключ OpenAI API. Ключ действует до закрытия или обновления страницы. OpenAI может взимать плату за запросы.';
  settings.showModal();
}

function render(data, isExample = false) {
  const heading = document.createElement('div');
  heading.className = 'result-head';
  const title = document.createElement('h3');
  title.textContent = data.title;
  const meta = document.createElement('p');
  meta.className = 'meta';
  meta.textContent = data.topics.join(' · ');
  heading.append(title, meta);

  const questions = document.createElement('ol');
  questions.className = 'exercises';
  const details = document.createElement('details');
  details.className = 'answers';
  const summary = document.createElement('summary');
  summary.textContent = 'Ответы и решения';
  const answers = document.createElement('ol');
  answers.className = 'exercises';
  details.append(summary, answers);
  for (const task of data.tasks) {
    const item = document.createElement('li');
    item.textContent = task.question;
    questions.append(item);
    const answer = document.createElement('li');
    const value = document.createElement('strong');
    value.textContent = task.answer;
    const solution = document.createElement('p');
    solution.className = 'solution';
    solution.textContent = task.solution;
    answer.append(value, solution);
    answers.append(answer);
  }
  const actions = document.createElement('div');
  actions.className = 'result-actions';
  const print = document.createElement('button');
  print.type = 'button';
  print.className = 'secondary';
  print.textContent = 'Печать / PDF';
  print.addEventListener('click', () => window.print());
  actions.append(print);
  result.replaceChildren(heading, questions, details, actions);
  done();
  byId('status').textContent = isExample ? 'Открыт пример варианта.' : 'Тренировочный вариант готов.';
  byId('result-panel').focus();
}

function done() {
  byId('loading').hidden = true;
  result.hidden = !result.childElementCount;
  byId('empty').hidden = !result.hidden;
  byId('generate').disabled = false;
  byId('cancel').hidden = true;
}

function asDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Не удалось прочитать файл. Попробуй выбрать его ещё раз.'));
    reader.readAsDataURL(blob);
  });
}

async function prepareFile(file) {
  const type = fileType(file);
  if (type === 'text/plain') return { text: (await file.text()).trim() };
  let blob = new Blob([file], { type });
  if (type.startsWith('image/') && file.size > 1200000 && 'createImageBitmap' in window) {
    let image;
    try {
      image = await createImageBitmap(blob);
      const ratio = Math.min(1, 2400 / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * ratio));
      canvas.height = Math.max(1, Math.round(image.height * ratio));
      const context = canvas.getContext('2d', { alpha: false });
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const compressed = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .9));
      if (compressed?.size && compressed.size < blob.size) blob = compressed;
    } catch {
      // The server can validate and process the original image.
    } finally {
      image?.close();
    }
  }
  return { type: blob.type, data: String(await asDataUrl(blob)).split(',')[1] };
}

byId('file-mode').onclick = () => switchMode('file');
byId('text-mode').onclick = () => { switchMode('text'); sourceText.focus(); };
drop.onclick = () => fileInput.click();
fileInput.onchange = () => { if (fileInput.files[0]) setFile(fileInput.files[0]); };
byId('clear-file').onclick = () => setFile();
drop.ondragover = event => { event.preventDefault(); drop.classList.add('dragging'); };
drop.ondragleave = () => drop.classList.remove('dragging');
drop.ondrop = event => {
  event.preventDefault();
  drop.classList.remove('dragging');
  if (event.dataTransfer.files.length !== 1) {
    message(byId('error'), 'Загрузи одну работу за раз. Если страниц несколько, объедини их в PDF.');
    return;
  }
  setFile(event.dataTransfer.files[0]);
};
byId('example').onclick = () => render(example, true);
byId('open-settings').onclick = async () => { await ready; showSettings(); };
byId('close-settings').onclick = () => settings.close();
settings.addEventListener('close', () => { keyInput.value = ''; });
byId('clear-key').onclick = () => { personalKey = ''; settings.close(); };
byId('settings-form').onsubmit = event => {
  event.preventDefault();
  const key = keyInput.value.trim();
  if (!/^sk-[A-Za-z0-9_-]{15,397}$/.test(key)) {
    message(byId('key-error'), 'Введи действительный ключ OpenAI API, начинающийся с sk-.');
    return;
  }
  personalKey = key;
  settings.close();
  message(byId('error'));
  byId('status').textContent = 'Ключ сохранён в этой вкладке.';
};
byId('cancel').onclick = () => activeRequest?.abort();
form.onsubmit = async event => {
  event.preventDefault();
  if (activeRequest) return;
  message(byId('error'));
  const file = selectedFile;
  const text = sourceText.value.trim();
  const currentMode = mode;
  if (currentMode === 'file' && !file || currentMode === 'text' && !text) {
    message(byId('error'), currentMode === 'file' ? 'Сначала выбери файл с исходной работой.' : 'Вставь условия заданий.');
    return;
  }
  const request = new AbortController();
  activeRequest = request;
  byId('generate').disabled = true;
  try {
    await ready;
    if (!personalKey && !serverReady) {
      showSettings();
      return;
    }
    byId('empty').hidden = true;
    result.hidden = true;
    byId('loading').hidden = false;
    byId('cancel').hidden = false;
    byId('status').textContent = 'Генерируем тренировочный вариант.';
    const source = currentMode === 'file' ? await prepareFile(file) : { text };
    if ('text' in source && (!source.text || source.text.length > 16000)) {
      throw new Error('Текст работы должен содержать от 1 до 16 000 символов.');
    }
    const headers = { 'Content-Type': 'application/json' };
    if (personalKey) headers.Authorization = `Bearer ${personalKey}`;
    const response = await fetch('/api/generate', {
      method: 'POST', headers, body: JSON.stringify(source), signal: request.signal
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.variant) throw new Error(data?.error || 'Сервер временно недоступен. Попробуй ещё раз.');
    render(data.variant);
  } catch (error) {
    if (request.signal.aborted) byId('status').textContent = 'Ожидание отменено.';
    else message(byId('error'), error instanceof TypeError ? 'Соединение прервалось. Попробуй ещё раз.' : error.message);
  } finally {
    activeRequest = undefined;
    done();
  }
};
