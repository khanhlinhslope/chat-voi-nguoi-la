const DEBUG = true;

function log(...args) {
    if (DEBUG) {
        console.log(...args);
    }
}

let socket;
let userId; // Lưu trữ ID của người dùng hiện tại
const chatMessages = document.getElementById('chatMessages');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const nextButton = document.getElementById('nextButton');
let localStream;
let peerConnection;
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const toggleVideoBtn = document.getElementById('toggleVideo');
const toggleAudioBtn = document.getElementById('toggleAudio');
const statusIndicator = document.querySelector('.status-indicator');
const statusText = document.querySelector('.status-text');
const currentUserIdDisplay = document.getElementById('currentUserId');

// Thêm hàm lấy thông tin TURN server từ Twilio
async function getTurnCredentials() {
    try {
        const response = await fetch('/get-turn-credentials');
        const credentials = await response.json();
        return credentials;
    } catch (error) {
        console.error('Lỗi khi lấy thông tin TURN server:', error);
        return null;
    }
}

// Cấu hình STUN/TURN servers
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        {
            urls: [
                'turn:relay1.metered.ca:80',
                'turn:relay1.metered.ca:443',
                'turn:relay1.metered.ca:443?transport=tcp'
            ],
            username: 'e899a0e2c2a5bbb5f7e4c589',
            credential: 'pCZkBe/7EwXsLVUX'
        }
    ],
    iceCandidatePoolSize: 10
};

// Khởi tạo media stream
async function initializeMedia() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });
        console.log('Got local stream:', localStream.getTracks());
        localVideo.srcObject = localStream;
        await localVideo.play().catch(e => console.error('Error playing local video:', e));

        // Thêm event listeners cho các nút điều khiển
        toggleVideoBtn.addEventListener('click', toggleVideo);
        toggleAudioBtn.addEventListener('click', toggleAudio);

        return true;
    } catch (e) {
        console.error('Lỗi khi truy cập camera:', e);
        addSystemMessage('Không thể truy cập camera hoặc microphone. Lỗi: ' + e.message);
        return false;
    }
}

// Bật/tắt video
function toggleVideo() {
    const videoTrack = localStream.getVideoTracks()[0];
    videoTrack.enabled = !videoTrack.enabled;
    toggleVideoBtn.textContent = videoTrack.enabled ? 'Tắt Camera' : 'Bật Camera';
    toggleVideoBtn.classList.toggle('disabled');
}

// Bật/tắt audio
function toggleAudio() {
    const audioTrack = localStream.getAudioTracks()[0];
    audioTrack.enabled = !audioTrack.enabled;
    toggleAudioBtn.textContent = audioTrack.enabled ? 'Tắt Mic' : 'Bật Mic';
    toggleAudioBtn.classList.toggle('disabled');
}

// Khởi tạo kết nối WebRTC
async function initializePeerConnection() {
    peerConnection = new RTCPeerConnection(configuration);

    // Thêm local stream
    localStream.getTracks().forEach(track => {
        console.log('Adding local track:', track.kind);
        peerConnection.addTrack(track, localStream);
    });

    // Xử lý remote stream
    peerConnection.ontrack = event => {
        console.log('Received remote track:', event.track.kind);
        if (event.streams && event.streams[0]) {
            console.log('Setting remote stream');
            remoteVideo.srcObject = event.streams[0];
            // Tự động phát khi nhận được stream
            remoteVideo.play().catch(e => console.error('Error playing remote video:', e));
        }
    };

    // Xử lý ICE candidates
    peerConnection.onicecandidate = event => {
        if (event.candidate) {
            console.log('Sending ICE candidate');
            socket.send(JSON.stringify({
                type: 'webrtc',
                webrtcData: {
                    type: 'candidate',
                    candidate: event.candidate
                }
            }));
        }
    };

    // Log trạng thái kết nối ICE
    peerConnection.oniceconnectionstatechange = () => {
        console.log('ICE connection state:', peerConnection.iceConnectionState);
        switch(peerConnection.iceConnectionState) {
            case 'checking':
                addSystemMessage('Đang thiết lập kết nối video...');
                break;
            case 'connected':
                addSystemMessage('Kết nối video thành công!');
                // Đảm bảo remote video được phát
                if (remoteVideo.srcObject && remoteVideo.paused) {
                    remoteVideo.play().catch(e => console.error('Error playing remote video:', e));
                }
                break;
            case 'failed':
                addSystemMessage('Kết nối video thất bại. Đang thử lại...');
                restartIce();
                break;
            case 'disconnected':
                addSystemMessage('Kết nối video bị gián đoạn. Đang kết nối lại...');
                break;
        }
    };

    // Xử lý negotiation
    peerConnection.onnegotiationneeded = async () => {
        try {
            console.log('Creating offer...');
            const offer = await peerConnection.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true
            });
            console.log('Setting local description...');
            await peerConnection.setLocalDescription(offer);
            console.log('Sending offer...');
            socket.send(JSON.stringify({
                type: 'webrtc',
                webrtcData: {
                    type: 'offer',
                    offer: peerConnection.localDescription
                }
            }));
        } catch (e) {
            console.error('Error during negotiation:', e);
        }
    };
}

// Thêm hàm restart ICE
async function restartIce() {
    try {
        const offer = await peerConnection.createOffer({ iceRestart: true });
        await peerConnection.setLocalDescription(offer);
        socket.send(JSON.stringify({
            type: 'webrtc',
            webrtcData: {
                type: 'offer',
                offer: offer
            }
        }));
    } catch (e) {
        console.error('Lỗi khi restart ICE:', e);
    }
}

// Thêm UI cho kết nối theo ID
function addConnectByIdUI() {
    const header = document.querySelector('.header');
    const idContainer = document.createElement('div');
    idContainer.className = 'id-container';
    idContainer.innerHTML = `
        <div class="user-id">ID của bạn: <span id="currentUserId">-</span></div>
        <div class="connect-form">
            <input type="text" id="targetIdInput" placeholder="Nhập ID người muốn kết nối">
            <button id="connectToId">Kết nối</button>
        </div>
    `;
    header.appendChild(idContainer);

    // Thêm sự kiện cho nút kết nối
    document.getElementById('connectToId').addEventListener('click', () => {
        const targetId = document.getElementById('targetIdInput').value.trim();
        if (targetId) {
            socket.send(JSON.stringify({
                type: 'connectTo',
                targetId: targetId
            }));
        }
    });
}

// Hàm cập nhật trạng thái kết nối
function updateConnectionStatus(status, message) {
    switch(status) {
        case 'connecting':
            statusIndicator.style.backgroundColor = '#ffd700'; // Màu vàng
            statusText.textContent = 'Đang kết nối...';
            break;
        case 'connected':
            statusIndicator.style.backgroundColor = '#4CAF50'; // Màu xanh
            statusText.textContent = 'Đã kết nối';
            break;
        case 'disconnected':
            statusIndicator.style.backgroundColor = '#ff4444'; // Màu đỏ
            statusText.textContent = message || 'Mất kết nối';
            break;
        case 'waiting':
            statusIndicator.style.backgroundColor = '#2196F3'; // Màu xanh dương
            statusText.textContent = 'Đang chờ người lạ...';
            break;
    }
}

// Cập nhật hàm connectWebSocket
function connectWebSocket() {
    updateConnectionStatus('connecting');
    // Tự động xác định WebSocket URL dựa trên current host
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname === 'localhost' ? 
        `${window.location.hostname}:3000` : 
        window.location.host;
    const wsUrl = `${protocol}//${host}`;
    socket = new WebSocket(wsUrl);
    
    socket.onopen = async () => {
        console.log('Đã kết nối với máy chủ');
        updateConnectionStatus('waiting');
        const mediaInitialized = await initializeMedia();
        if (mediaInitialized) {
            initializePeerConnection();
        }
    };
    
    socket.onmessage = async (event) => {
        try {
            const message = JSON.parse(event.data);
            log('Nhận tin nhắn:', message);
            
            if (message.type === 'userId') {
                userId = message.userId;
                currentUserIdDisplay.textContent = `ID của bạn: ${userId}`;
                // Copy ID button
                const copyButton = document.createElement('button');
                copyButton.innerHTML = '<i class="fas fa-copy"></i>';
                copyButton.className = 'copy-id-btn';
                copyButton.title = 'Sao chép ID';
                copyButton.onclick = () => {
                    navigator.clipboard.writeText(userId).then(() => {
                        copyButton.innerHTML = '<i class="fas fa-check"></i>';
                        setTimeout(() => {
                            copyButton.innerHTML = '<i class="fas fa-copy"></i>';
                        }, 2000);
                    });
                };
                currentUserIdDisplay.appendChild(copyButton);
            } else if (message.type === 'webrtc') {
                log('WebRTC message:', message.webrtcData);
                const webrtcData = message.webrtcData;
                
                if (webrtcData.type === 'offer') {
                    console.log('Received offer. Creating answer...');
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(webrtcData.offer));
                    const answer = await peerConnection.createAnswer({
                        offerToReceiveAudio: true,
                        offerToReceiveVideo: true
                    });
                    await peerConnection.setLocalDescription(answer);
                    
                    socket.send(JSON.stringify({
                        type: 'webrtc',
                        webrtcData: {
                            type: 'answer',
                            answer: answer
                        }
                    }));
                } else if (webrtcData.type === 'answer') {
                    console.log('Received answer');
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(webrtcData.answer));
                } else if (webrtcData.type === 'candidate') {
                    console.log('Received ICE candidate');
                    try {
                        await peerConnection.addIceCandidate(new RTCIceCandidate(webrtcData.candidate));
                    } catch (e) {
                        console.error('Error adding received ICE candidate:', e);
                    }
                }
            } else if (message.type === 'system') {
                addSystemMessage(message.text);
                if (message.text === 'Đã kết nối với người lạ!') {
                    updateConnectionStatus('connected');
                    // Tạo offer khi kết nối với người lạ
                    try {
                        const offer = await peerConnection.createOffer();
                        await peerConnection.setLocalDescription(offer);
                        socket.send(JSON.stringify({
                            type: 'webrtc',
                            webrtcData: {
                                type: 'offer',
                                offer: offer
                            }
                        }));
                    } catch (e) {
                        console.error('Lỗi khi tạo offer:', e);
                    }
                } else if (message.text === 'Đang chờ người lạ...') {
                    updateConnectionStatus('waiting');
                }
            } else if (message.type === 'message') {
                addMessage(message.text, 'received');
            }
        } catch (e) {
            console.error('Error handling message:', e);
        }
    };
    
    socket.onclose = () => {
        console.log('Mất kết nối với máy chủ');
        updateConnectionStatus('disconnected', 'Mất kết nối với máy chủ');
        addSystemMessage('Mất kết nối với máy chủ');
    };

    socket.onerror = (error) => {
        console.error('WebSocket error:', error);
        updateConnectionStatus('disconnected', 'Có lỗi kết nối');
        addSystemMessage('Có lỗi kết nối');
    };
}

// Thêm tin nhắn vào khung chat
function addMessage(text, type) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', type);
    messageDiv.textContent = text;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Thêm tin nhắn hệ thống
function addSystemMessage(text) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', 'system');
    messageDiv.textContent = text;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Gửi tin nhắn
function sendMessage() {
    const text = messageInput.value.trim();
    if (text && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'message', text }));
        addMessage(text, 'sent');
        messageInput.value = '';
    }
}

// Tìm người chat mới
function findNewPartner() {
    if (peerConnection) {
        peerConnection.close();
    }
    if (socket) {
        socket.close();
    }
    chatMessages.innerHTML = '';
    remoteVideo.srcObject = null;
    updateConnectionStatus('connecting');
    addSystemMessage('Đang tìm người lạ...');
    connectWebSocket();
}

// Thêm các event listeners
sendButton.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});
nextButton.addEventListener('click', findNewPartner);

// Thêm styles cho UI mới
const style = document.createElement('style');
style.textContent = `
.id-container {
    margin-bottom: 20px;
    text-align: center;
}

.user-id {
    margin-bottom: 10px;
    font-weight: bold;
}

.connect-form {
    display: flex;
    gap: 10px;
    justify-content: center;
}

#targetIdInput {
    padding: 8px;
    border: 1px solid #ddd;
    border-radius: 5px;
    width: 200px;
}

.copy-id-btn {
    background: none;
    border: none;
    cursor: pointer;
    padding: 5px 10px;
    margin-left: 10px;
    color: var(--primary-color);
    transition: all 0.3s ease;
}

.copy-id-btn:hover {
    color: var(--secondary-color);
    transform: scale(1.1);
}

.user-id {
    display: flex;
    align-items: center;
    gap: 10px;
}
`;
document.head.appendChild(style);

// Khởi tạo UI khi trang được tải
document.addEventListener('DOMContentLoaded', () => {
    // Kiểm tra xem người dùng đã đồng ý điều khoản chưa
    if (localStorage.getItem('termsAccepted') !== 'true') {
        window.location.href = './index.html';
        return;
    }

    // Tiếp tục với code khởi tạo chat
    addConnectByIdUI();
    connectWebSocket();
}); 
