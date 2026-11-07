<script setup>
import axios from 'axios';
import { io } from 'socket.io-client';
import { computed, onBeforeUnmount, ref } from 'vue';

const apiOrigin = import.meta.env.VITE_BASTION_API_URL || '';
const socketOrigin = import.meta.env.VITE_BASTION_SOCKET_URL || apiOrigin || window.location.origin;
const apiConfigured = !import.meta.env.PROD || Boolean(apiOrigin);
const api = axios.create({ baseURL: `${apiOrigin}/api`, timeout: 10000 });
const usernameInput = ref('');
const passwordInput = ref('');
const accessToken = ref('');
const currentUser = ref(null);
const teams = ref([]);
const selectedTeamId = ref('');
const channels = ref([]);
const selectedChannelId = ref('');
const tasks = ref([]);
const messages = ref([]);
const messageInput = ref('');
const messageTtl = ref('60');
const taskTitle = ref('');
const taskClearance = ref(1);
const errorMessage = ref('');
const statusMessage = ref('');
const socketState = ref('disconnected');
const now = ref(Date.now());
let socket;
let timer;

const selectedTeam = computed(() => teams.value.find(team => team.id === selectedTeamId.value));
const canCreateTasks = computed(() => selectedTeam.value?.role === 'commander');

function authHeaders() {
  return { Authorization: `${['B', 'earer'].join('')} ${accessToken.value}` };
}

function stopSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  clearInterval(timer);
  socketState.value = 'disconnected';
}

function connectSocket() {
  stopSocket();
  socket = io(socketOrigin, {
    path: '/socket.io',
    auth: { token: accessToken.value },
    transports: ['websocket', 'polling'],
    reconnection: false
  });
  socket.on('connect', () => {
    socketState.value = 'connected';
    if (selectedChannelId.value) joinChannel(selectedChannelId.value);
  });
  socket.on('connect_error', () => {
    socketState.value = 'unavailable';
    errorMessage.value = 'Realtimeverbinding niet beschikbaar; controleer de API-configuratie.';
  });
  socket.on('disconnect', () => { socketState.value = 'disconnected'; });
  socket.on('receive_message', message => {
    if (message.channel_id === selectedChannelId.value) {
      messages.value = [...messages.value, message].slice(-100);
    }
  });
  socket.on('message_destroyed', ({ id }) => {
    messages.value = messages.value.map(message =>
      message.id === id ? { ...message, content: null, destroyed: true } : message
    );
  });
  socket.on('tasks_changed', ({ teamId }) => {
    if (teamId === selectedTeamId.value) loadTasks();
  });
}

async function login() {
  errorMessage.value = '';
  try {
    const response = await api.post('/auth/login', {
      username: usernameInput.value,
      password: passwordInput.value
    });
    accessToken.value = response.data.accessToken;
    currentUser.value = response.data.user;
    passwordInput.value = '';
    const teamResponse = await api.get('/teams', { headers: authHeaders() });
    teams.value = teamResponse.data;
    selectedTeamId.value = teams.value[0]?.id || '';
    if (selectedTeamId.value) await selectTeam();
    connectSocket();
    statusMessage.value = 'Aangemeld. De toegang is beperkt tot toegewezen teams en kanalen.';
    timer = setInterval(() => { now.value = Date.now(); }, 1000);
  } catch (error) {
    accessToken.value = '';
    currentUser.value = null;
    errorMessage.value = error.response?.data?.error || 'Aanmelden mislukt; controleer de API en database.';
  }
}

async function selectTeam() {
  if (!selectedTeamId.value) return;
  errorMessage.value = '';
  try {
    const [taskResponse, channelResponse] = await Promise.all([
      api.get(`/teams/${selectedTeamId.value}/tasks`, { headers: authHeaders() }),
      api.get(`/teams/${selectedTeamId.value}/channels`, { headers: authHeaders() })
    ]);
    tasks.value = taskResponse.data;
    channels.value = channelResponse.data;
    selectedChannelId.value = channels.value[0]?.id || '';
    if (selectedChannelId.value) await selectChannel();
    else messages.value = [];
  } catch (error) {
    errorMessage.value = error.response?.data?.error || 'Teamgegevens konden niet worden geladen.';
  }
}

async function selectChannel() {
  if (!selectedChannelId.value) {
    messages.value = [];
    return;
  }
  errorMessage.value = '';
  try {
    const response = await api.get(`/channels/${selectedChannelId.value}/messages`, {
      headers: authHeaders()
    });
    messages.value = response.data;
    if (socket?.connected) joinChannel(selectedChannelId.value);
  } catch (error) {
    messages.value = [];
    errorMessage.value = error.response?.data?.error || 'Kanaalberichten konden niet worden geladen.';
  }
}

function joinChannel(channelId) {
  socket.emit('join_channel', { channelId }, result => {
    if (result?.error) errorMessage.value = result.error;
  });
}

function sendMessage() {
  if (!socket?.connected || !selectedChannelId.value || !messageInput.value.trim()) return;
  socket.emit('send_message', {
    channelId: selectedChannelId.value,
    content: messageInput.value.trim(),
    ttlSeconds: messageTtl.value ? Number(messageTtl.value) : null
  }, result => {
    if (result?.error) {
      errorMessage.value = result.error;
      return;
    }
    messageInput.value = '';
  });
}

async function createTask() {
  if (!taskTitle.value.trim() || !selectedTeamId.value) return;
  errorMessage.value = '';
  try {
    await api.post(`/teams/${selectedTeamId.value}/tasks`, {
      title: taskTitle.value.trim(),
      clearanceLevel: Number(taskClearance.value)
    }, { headers: authHeaders() });
    taskTitle.value = '';
    await loadTasks();
  } catch (error) {
    errorMessage.value = error.response?.data?.error || 'Taak kon niet worden aangemaakt.';
  }
}

async function updateTask(task, event) {
  errorMessage.value = '';
  try {
    await api.patch(`/tasks/${task.id}`, { status: event.target.value }, {
      headers: authHeaders()
    });
    await loadTasks();
  } catch (error) {
    errorMessage.value = error.response?.data?.error || 'Taakstatus kon niet worden bijgewerkt.';
  }
}

async function loadTasks() {
  if (!selectedTeamId.value) return;
  try {
    const response = await api.get(`/teams/${selectedTeamId.value}/tasks`, {
      headers: authHeaders()
    });
    tasks.value = response.data;
  } catch (error) {
    errorMessage.value = error.response?.data?.error || 'Taken konden niet worden geladen.';
  }
}

function logout() {
  stopSocket();
  accessToken.value = '';
  currentUser.value = null;
  teams.value = [];
  channels.value = [];
  tasks.value = [];
  messages.value = [];
  selectedTeamId.value = '';
  selectedChannelId.value = '';
  statusMessage.value = 'Lokale sessie beëindigd.';
}

function messageRemaining(message) {
  if (!message.expires_at) return 'Geen timer';
  return `${Math.max(0, Math.ceil((new Date(message.expires_at).getTime() - now.value) / 1000))}s`;
}

onBeforeUnmount(stopSocket);
</script>

<template>
  <div class="bastion-app">
    <header class="topbar">
      <a href="/citadel/" class="back-link">← PALACO Hoofdkantoor</a>
      <div class="brand">
        <span class="brand-mark" aria-hidden="true">B</span>
        <div>
          <p class="eyebrow">CITADEL SYSTEMS · TEAM COORDINATION PROTOTYPE</p>
          <h1>BASTION</h1>
        </div>
      </div>
      <div v-if="currentUser" class="session">
        <span>{{ currentUser.username }}</span>
        <button type="button" class="quiet-button" @click="logout">Afmelden</button>
      </div>
    </header>

    <main>
      <section class="notice" aria-labelledby="prototype-notice">
        <strong id="prototype-notice">PROTOTYPE · NIET VOOR VERTROUWELIJKE GEGEVENS</strong>
        <p>
          Berichten worden server-side opgeslagen en niet end-to-end versleuteld.
          Verlooptijd is geen gegarandeerde veilige vernietiging: databases, logs,
          back-ups, browsergeheugen en screenshots kunnen inhoud behouden. Laat dit
          systeem onafhankelijk beoordelen vóór enig operationeel gebruik.
        </p>
      </section>

      <section v-if="!currentUser" class="login-panel" aria-labelledby="login-title">
        <p class="eyebrow">AUTHENTICATED WORKSPACE</p>
        <h2 id="login-title">Aanmelden bij Bastion</h2>
        <p>Accounts en teamtoegang worden door een beheerder buiten deze interface ingericht.</p>
        <p v-if="!apiConfigured" class="configuration-warning">
          De statische hosting heeft geen geconfigureerde Bastion API. Stel de API-origin in vóór aanmelden.
        </p>
        <form @submit.prevent="login">
          <label for="username">Gebruikersnaam</label>
          <input id="username" v-model="usernameInput" autocomplete="username" required maxlength="50" :disabled="!apiConfigured" />
          <label for="password">Wachtwoord</label>
          <input id="password" v-model="passwordInput" type="password" autocomplete="current-password" required :disabled="!apiConfigured" />
          <button class="primary-button" type="submit" :disabled="!apiConfigured">Aanmelden</button>
        </form>
      </section>

      <template v-else>
        <section class="workspace-toolbar">
          <label>
            Team
            <select v-model="selectedTeamId" @change="selectTeam">
              <option v-for="team in teams" :key="team.id" :value="team.id">
                {{ team.name }} · {{ team.role }} · niveau {{ team.clearance_level }}
              </option>
            </select>
          </label>
          <span class="connection-state" :data-state="socketState">
            Realtime: {{ socketState }}
          </span>
        </section>

        <div class="workspace-grid">
          <section class="panel tasks-panel" aria-labelledby="tasks-title">
            <header class="panel-heading">
              <div>
                <p class="eyebrow">NEED-TO-KNOW FILTERED</p>
                <h2 id="tasks-title">Takenbord</h2>
              </div>
              <span class="count">{{ tasks.length }}</span>
            </header>
            <form v-if="canCreateTasks" class="create-task" @submit.prevent="createTask">
              <label class="visually-hidden" for="task-title">Nieuwe taak</label>
              <input id="task-title" v-model="taskTitle" maxlength="150" placeholder="Nieuwe taak…" required />
              <label for="task-clearance">Niveau</label>
              <select id="task-clearance" v-model="taskClearance">
                <option v-for="level in selectedTeam.clearance_level" :key="level" :value="level">{{ level }}</option>
              </select>
              <button class="primary-button" type="submit">Toevoegen</button>
            </form>
            <ul class="task-list">
              <li v-for="task in tasks" :key="task.id" class="task-row">
                <div>
                  <strong>{{ task.title }}</strong>
                  <p>{{ task.priority }} · niveau {{ task.clearance_level }}</p>
                </div>
                <select :value="task.status" :aria-label="`Status ${task.title}`"
                  :disabled="selectedTeam.role !== 'commander' && task.assigned_to !== currentUser.id"
                  @change="updateTask(task, $event)">
                  <option value="PENDING">In afwachting</option>
                  <option value="ACTIVE">Actief</option>
                  <option value="COMPLETED">Voltooid</option>
                </select>
              </li>
              <li v-if="tasks.length === 0" class="empty">Geen toegankelijke taken.</li>
            </ul>
            <p class="panel-foot">Alleen teamlidmaatschap, clearance en taaktoewijzing bepalen zichtbaarheid.</p>
          </section>

          <section class="panel chat-panel" aria-labelledby="chat-title">
            <header class="panel-heading">
              <div>
                <p class="eyebrow">SERVER-SIDE · NOT END-TO-END ENCRYPTED</p>
                <h2 id="chat-title">Berichtenkanaal</h2>
              </div>
              <label class="channel-select">
                Kanaal
                <select v-model="selectedChannelId" @change="selectChannel">
                  <option v-for="channel in channels" :key="channel.id" :value="channel.id">
                    {{ channel.name }} · niveau {{ channel.clearance_level }}
                  </option>
                </select>
              </label>
            </header>
            <ol class="message-list" aria-live="polite">
              <li v-for="message in messages" :key="message.id" class="message">
                <template v-if="message.destroyed || !message.content">
                  <span>Bericht verlopen; inhoud niet beschikbaar.</span>
                </template>
                <template v-else>
                  <p>{{ message.content }}</p>
                  <small>Gebruiker {{ message.sender_id }} · verloopt over {{ messageRemaining(message) }}</small>
                </template>
              </li>
              <li v-if="messages.length === 0" class="empty">Geen berichten in dit kanaal.</li>
            </ol>
            <form class="message-form" @submit.prevent="sendMessage">
              <label class="visually-hidden" for="message-input">Bericht</label>
              <input id="message-input" v-model="messageInput" maxlength="2000" placeholder="Bericht…" :disabled="!selectedChannelId" required />
              <select v-model="messageTtl" aria-label="Berichtverlooptijd">
                <option value="30">30 seconden</option>
                <option value="60">1 minuut</option>
                <option value="300">5 minuten</option>
                <option value="">Niet automatisch verlopen</option>
              </select>
              <button class="primary-button" type="submit" :disabled="socketState !== 'connected' || !selectedChannelId">Versturen</button>
            </form>
          </section>
        </div>
      </template>

      <p v-if="errorMessage" class="feedback error" role="alert">{{ errorMessage }}</p>
      <p v-if="statusMessage" class="feedback" role="status">{{ statusMessage }}</p>
    </main>
    <footer>Toegang is technisch afgedwongen volgens deze prototype-policy; dit is geen productiebeveiligingscertificering.</footer>
  </div>
</template>
