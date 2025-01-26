const express = require('express');
const { Server } = require('ws');
const path = require('path');
const twilio = require('twilio');

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

// Middleware để redirect HTTP sang HTTPS trên production
if (isProduction) {
    app.use((req, res, next) => {
        if (req.header('x-forwarded-proto') !== 'https') {
            res.redirect(`https://${req.header('host')}${req.url}`);
        } else {
            next();
        }
    });
}

// Phục vụ static files
app.use(express.static(path.join(__dirname, './')));

// Tạo HTTP server
const server = app.listen(PORT, () => {
    console.log(`Server đang chạy tại cổng ${PORT}`);
});

// Tạo WebSocket server
const wss = new Server({ server });

// Lưu trữ các người dùng đang chờ ghép cặp
let waitingUsers = [];
// Lưu trữ các cặp chat đang hoạt động
const activeConnections = new Map();
// Lưu trữ ID của người dùng
const userIds = new Map();

// Tạo ID ngẫu nhiên
function generateUserId() {
    return Math.random().toString(36).substr(2, 9);
}

// Hàm kiểm tra trạng thái kết nối
function isSocketAlive(socket) {
    return socket.readyState === WebSocket.OPEN;
}

// Hàm gửi tin nhắn an toàn
function safeSend(socket, message) {
    if (isSocketAlive(socket)) {
        try {
            socket.send(JSON.stringify(message));
        } catch (e) {
            console.error('Lỗi khi gửi tin nhắn:', e);
        }
    }
}

// Hàm dọn dẹp các kết nối không hợp lệ
function cleanupConnections() {
    waitingUsers = waitingUsers.filter(socket => isSocketAlive(socket));
    for (const [socket, partner] of activeConnections.entries()) {
        if (!isSocketAlive(socket) || !isSocketAlive(partner)) {
            if (isSocketAlive(partner)) {
                safeSend(partner, { 
                    type: 'system', 
                    text: 'Người lạ đã ngắt kết nối' 
                });
            }
            activeConnections.delete(socket);
            activeConnections.delete(partner);
        }
    }
}

wss.on('connection', (socket) => {
    console.log('Người dùng mới kết nối');
    
    // Tạo ID cho người dùng mới
    const userId = generateUserId();
    userIds.set(socket, userId);
    
    // Gửi ID cho người dùng ngay khi kết nối
    safeSend(socket, {
        type: 'userId',
        userId: userId
    });

    console.log(`Đã tạo ID cho người dùng: ${userId}`);

    // Xử lý khi người dùng muốn tìm người chat
    function findPartner(targetId = null) {
        cleanupConnections();

        if (activeConnections.has(socket)) {
            return;
        }

        if (targetId) {
            // Tìm socket của người dùng với ID cụ thể
            const targetSocket = Array.from(userIds.entries())
                .find(([sock, id]) => id === targetId && isSocketAlive(sock))?.[0];

            if (targetSocket && !activeConnections.has(targetSocket)) {
                // Thiết lập kết nối hai chiều
                activeConnections.set(socket, targetSocket);
                activeConnections.set(targetSocket, socket);

                // Thông báo cho cả hai người dùng
                const connectionMessage = {
                    type: 'system',
                    text: 'Đã kết nối với người lạ!'
                };
                safeSend(socket, connectionMessage);
                safeSend(targetSocket, connectionMessage);

                console.log(`Đã ghép cặp người dùng ${userId} với ${targetId}`);
            } else {
                safeSend(socket, {
                    type: 'system',
                    text: 'Không tìm thấy người dùng với ID này hoặc họ đang bận'
                });
            }
            return;
        }

        // Tìm người ngẫu nhiên
        if (waitingUsers.length > 0) {
            // Lấy người đầu tiên trong hàng đợi
            const partner = waitingUsers.shift();
            
            if (isSocketAlive(partner) && !activeConnections.has(partner)) {
                // Thiết lập kết nối hai chiều
                activeConnections.set(socket, partner);
                activeConnections.set(partner, socket);

                // Thông báo cho cả hai người dùng
                const connectionMessage = {
                    type: 'system',
                    text: 'Đã kết nối với người lạ!'
                };
                safeSend(socket, connectionMessage);
                safeSend(partner, connectionMessage);

                console.log(`Đã ghép cặp ngẫu nhiên người dùng ${userId}`);
            } else {
                // Nếu partner không hợp lệ, thử tìm lại
                findPartner();
            }
        } else {
            // Thêm vào danh sách chờ
            waitingUsers.push(socket);
            safeSend(socket, {
                type: 'system',
                text: 'Đang chờ người lạ...'
            });
            console.log(`Người dùng ${userId} đang chờ ghép cặp`);
        }
    }

    // Xử lý tin nhắn
    socket.on('message', async (message) => {
        try {
            const parsedMessage = JSON.parse(message);
            console.log(`Nhận tin nhắn từ ${userId}:`, parsedMessage);
            
            if (parsedMessage.type === 'connectTo') {
                findPartner(parsedMessage.targetId);
                return;
            }

            if (parsedMessage.type === 'report') {
                const reportData = parsedMessage.reportData;
                console.log('Report received:', reportData);
            }

            const partner = activeConnections.get(socket);
            if (partner && isSocketAlive(partner)) {
                // Chuyển tiếp tin nhắn WebRTC ngay lập tức
                if (parsedMessage.type === 'webrtc') {
                    console.log('Chuyển tiếp tin nhắn WebRTC:', parsedMessage.webrtcData.type);
                }
                safeSend(partner, parsedMessage);
            }
        } catch (e) {
            console.error('Lỗi khi xử lý tin nhắn:', e);
        }
    });

    // Xử lý ngắt kết nối
    socket.on('close', () => {
        const partnerId = userIds.get(activeConnections.get(socket));
        console.log(`Người dùng ${userId} ngắt kết nối${partnerId ? ` (đang chat với ${partnerId})` : ''}`);
        
        const partner = activeConnections.get(socket);
        if (partner && isSocketAlive(partner)) {
            safeSend(partner, {
                type: 'system',
                text: 'Người lạ đã ngắt kết nối'
            });
        }

        // Dọn dẹp các kết nối
        activeConnections.delete(socket);
        if (partner) {
            activeConnections.delete(partner);
        }
        waitingUsers = waitingUsers.filter(user => user !== socket);
        userIds.delete(socket);

        cleanupConnections();
    });

    // Tìm người chat ngay khi kết nối
    findPartner();
});

// Định kỳ dọn dẹp các kết nối không hợp lệ
setInterval(cleanupConnections, 10000);

// Xử lý lỗi process
process.on('unhandledRejection', (error) => {
    console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
});

// Thêm route để lấy thông tin TURN server
app.get('/get-turn-credentials', (req, res) => {
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    
    client.tokens.create().then(token => {
        res.json(token.iceServers);
    }).catch(err => {
        console.error('Lỗi khi lấy thông tin TURN server:', err);
        res.status(500).json({ error: 'Không thể lấy thông tin TURN server' });
    });
});

// Cập nhật WebSocket URL trong script.js
const wsProtocol = isProduction ? 'wss://' : 'ws://';
const wsUrl = isProduction ? 
    `${wsProtocol}${req.headers.host}` : 
    `${wsProtocol}localhost:${PORT}`; 