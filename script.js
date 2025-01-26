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
const chatMode = localStorage.getItem('chatMode') || 'text';
const videoContainer = document.querySelector('.video-container');

// Thêm biến toàn cục
let autoConnectInterval;
let isAutoConnecting = false;

// Thêm biến để theo dõi thời gian kết nối
let lastConnectionTime = 0;

// Thêm biến cho report và block
let reportModal = document.getElementById('reportModal');
let reportButton = document.getElementById('reportButton');
let blockButton = document.getElementById('blockButton');
let submitReport = document.getElementById('submitReport');
let closeReportModal = reportModal.querySelector('.close');
let blockedUsers = new Set(JSON.parse(localStorage.getItem('blockedUsers') || '[]'));

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
    if (chatMode === 'text') {
        // Ẩn phần video nếu là chat text
        videoContainer.style.display = 'none';
        return true;
    }

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
                addSystemMessage('Setting up video connection...');
                break;
            case 'connected':
                addSystemMessage('Video connection successful!');
                // Đảm bảo remote video được phát
                if (remoteVideo.srcObject && remoteVideo.paused) {
                    remoteVideo.play().catch(e => console.error('Error playing remote video:', e));
                }
                break;
            case 'failed':
                addSystemMessage('Video connection failed. Retrying...');
                restartIce();
                break;
            case 'disconnected':
                addSystemMessage('Disconnected');
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

// Hàm cập nhật trạng thái kết nối
function updateConnectionStatus(status) {
    switch(status) {
        case 'connecting':
            statusIndicator.style.backgroundColor = '#ffd700'; // Màu vàng
            statusText.textContent = 'Connecting...';
            break;
        case 'connected':
            statusIndicator.style.backgroundColor = '#4CAF50'; // Màu xanh
            statusText.textContent = 'Connected';
            lastConnectionTime = Date.now(); // Cập nhật thời gian kết nối
            break;
        case 'disconnected':
            statusIndicator.style.backgroundColor = '#ff4444'; // Màu đỏ
            statusText.textContent = 'Disconnected';
            break;
        case 'waiting':
            statusIndicator.style.backgroundColor = '#2196F3'; // Màu xanh dương
            statusText.textContent = 'Waiting for stranger...';
            break;
    }
}

// Cập nhật hàm connectWebSocket
function connectWebSocket() {
    updateConnectionStatus('connecting');
    const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
    const wsUrl = `${protocol}${window.location.host}`;
    socket = new WebSocket(wsUrl);
    
    socket.onopen = async () => {
        console.log('Đã kết nối với máy chủ');
        updateConnectionStatus('waiting');
        const mediaInitialized = await initializeMedia();
        if (mediaInitialized && chatMode === 'video') {
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
                if (message.text === 'Connected with a stranger!') {
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
                } else if (message.text === 'Waiting for a stranger...') {
                    updateConnectionStatus('waiting');
                }
            } else if (message.type === 'message') {
                addMessage(message.text, 'received');
            } else if (message.type === 'connected') {
                const partnerId = message.partnerId;
                if (blockedUsers.has(partnerId)) {
                    addSystemMessage('Blocked user detected. Finding new partner...');
                    findNewPartner();
                    return;
                }
                currentPartnerId = partnerId;
            }
        } catch (e) {
            console.error('Error handling message:', e);
        }
    };
    
    socket.onclose = () => {
        console.log('Mất kết nối với máy chủ');
        updateConnectionStatus('disconnected');
        addSystemMessage('Lost connection to server');
    };

    socket.onerror = (error) => {
        console.error('WebSocket error:', error);
        updateConnectionStatus('disconnected');
        addSystemMessage('Connection error');
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
    
    // Translate messages
    switch(text) {
        case 'Đang kết nối...':
            text = 'Connecting...';
            break;
        case 'Đã kết nối với người lạ!':
            text = 'Connected with a stranger!';
            break;
        case 'Người lạ đã ngắt kết nối':
            text = 'Stranger has disconnected';
            break;
        case 'Đang chờ người lạ...':
            text = 'Waiting for a stranger...';
            break;
        case 'Mất kết nối với máy chủ':
            text = 'Lost connection to server';
            break;
        case 'Có lỗi kết nối':
            text = 'Connection error';
            break;
        case 'Đang tìm người lạ...':
            text = 'Looking for a stranger...';
            break;
        case 'Kết nối video thành công!':
            text = 'Video connection successful!';
            break;
        case 'Kết nối video thất bại. Đang thử lại...':
            text = 'Video connection failed. Retrying...';
            break;
        case 'Đang thiết lập kết nối video...':
            text = 'Setting up video connection...';
            break;
    }
    
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

// Thêm hàm xử lý auto connect
function toggleAutoConnect() {
    const autoConnectBtn = document.getElementById('autoConnectBtn');
    const statusBadge = autoConnectBtn.querySelector('.status-badge');
    
    if (!isAutoConnecting) {
        // Bắt đầu auto connect
        isAutoConnecting = true;
        autoConnectBtn.classList.add('active');
        statusBadge.textContent = 'On';
        
        // Tìm người mới ngay lập tức
        findNewPartner();
        
        // Thiết lập interval để tự động tìm người mới
        autoConnectInterval = setInterval(() => {
            if (socket.readyState === WebSocket.OPEN) {
                const currentStatus = statusText.textContent;
                // Chỉ tìm người mới nếu đang ở trạng thái chờ hoặc đã kết nối quá lâu
                if (currentStatus === 'Waiting for stranger...' || 
                    currentStatus === 'Connected' && Date.now() - lastConnectionTime > 30000) {
                    findNewPartner();
                }
            }
        }, 10000); // Kiểm tra mỗi 10 giây
        
        addSystemMessage('Auto Connect is now ON. Will search for new partners automatically.');
    } else {
        // Dừng auto connect
        isAutoConnecting = false;
        autoConnectBtn.classList.remove('active');
        statusBadge.textContent = 'Off';
        clearInterval(autoConnectInterval);
        addSystemMessage('Auto Connect is now OFF.');
    }
}

// Thêm event listener cho nút auto connect
document.addEventListener('DOMContentLoaded', () => {
    // Kiểm tra xem người dùng đã đồng ý điều khoản chưa
    if (localStorage.getItem('termsAccepted') !== 'true') {
        window.location.href = './index.html';
        return;
    }

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

    // Kết nối WebSocket
    connectWebSocket();

    // Thêm event listener cho nút auto connect
    const autoConnectBtn = document.getElementById('autoConnectBtn');
    autoConnectBtn.addEventListener('click', toggleAutoConnect);
    
    // Dừng auto connect khi rời trang
    window.addEventListener('beforeunload', () => {
        if (isAutoConnecting) {
            clearInterval(autoConnectInterval);
        }
    });
});

// Thêm vào cuối file script.js
document.querySelector('.logo').addEventListener('click', () => {
    window.location.href = './index.html';
});

// Cập nhật hàm findNewPartner
function findNewPartner() {
    if (peerConnection) {
        peerConnection.close();
    }
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.close();
    }
    chatMessages.innerHTML = '';
    remoteVideo.srcObject = null;
    updateConnectionStatus('connecting');
    addSystemMessage(isAutoConnecting ? 'Auto searching for a new stranger...' : 'Looking for a stranger...');
    connectWebSocket();
}

// Xử lý report
reportButton.addEventListener('click', () => {
    if (!currentPartnerId) {
        addSystemMessage('No user to report');
        return;
    }
    reportModal.style.display = 'block';
});

closeReportModal.addEventListener('click', () => {
    reportModal.style.display = 'none';
});

submitReport.addEventListener('click', () => {
    const reason = document.querySelector('input[name="reportReason"]:checked')?.value;
    const description = document.getElementById('reportDescription').value;
    
    if (!reason) {
        alert('Please select a reason for reporting');
        return;
    }

    // Gửi report lên server
    socket.send(JSON.stringify({
        type: 'report',
        reportData: {
            targetId: currentPartnerId,
            reason: reason,
            description: description
        }
    }));

    addSystemMessage('Report submitted. Thank you for helping keep our community safe.');
    reportModal.style.display = 'none';
    
    // Tự động next sau khi report
    findNewPartner();
});

// Xử lý block
blockButton.addEventListener('click', () => {
    if (!currentPartnerId) {
        addSystemMessage('No user to block');
        return;
    }

    blockedUsers.add(currentPartnerId);
    localStorage.setItem('blockedUsers', JSON.stringify([...blockedUsers]));
    addSystemMessage(`User ${currentPartnerId} has been blocked`);
    findNewPartner();
}); 
