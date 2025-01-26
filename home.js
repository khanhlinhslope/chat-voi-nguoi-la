document.addEventListener('DOMContentLoaded', () => {
    const videoButton = document.getElementById('startVideoChat');
    const textButton = document.getElementById('startTextChat');
    const checkboxes = document.querySelectorAll('.term-item input[type="checkbox"]');
    const modal = document.getElementById('termsModal');
    const closeBtn = document.querySelector('.close');
    const termsLink = document.querySelector('.terms-link');
    
    // Thêm animation cho các section
    document.querySelectorAll('section').forEach((section, index) => {
        section.style.animationDelay = `${index * 0.1}s`;
    });

    // Kiểm tra trạng thái các checkbox
    function checkTerms() {
        const allChecked = Array.from(checkboxes).every(checkbox => checkbox.checked);
        videoButton.disabled = !allChecked;
        textButton.disabled = !allChecked;
        
        if (allChecked) {
            videoButton.classList.add('ready');
            textButton.classList.add('ready');
        } else {
            videoButton.classList.remove('ready');
            textButton.classList.remove('ready');
        }
    }

    // Thêm event listener cho các checkbox với animation
    checkboxes.forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const label = e.target.parentElement;
            if (e.target.checked) {
                label.style.animation = 'checkmark 0.2s ease-in-out';
            }
            checkTerms();
        });
    });

    // Xử lý khi nhấn nút chat video
    videoButton.addEventListener('click', () => {
        localStorage.setItem('termsAccepted', 'true');
        localStorage.setItem('chatMode', 'video');
        startChat(videoButton);
    });

    // Xử lý khi nhấn nút chat text
    textButton.addEventListener('click', () => {
        localStorage.setItem('termsAccepted', 'true');
        localStorage.setItem('chatMode', 'text');
        startChat(textButton);
    });

    function startChat(button) {
        const originalHTML = button.innerHTML;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Redirecting...';
        setTimeout(() => {
            window.location.href = './chat.html';
        }, 1000);
    }

    // Modal điều khoản
    termsLink.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = 'terms.html';
    });

    closeBtn.addEventListener('click', () => {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    });

    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
            document.body.style.overflow = 'auto';
        }
    });

    // Kiểm tra nếu đã đồng ý điều khoản trước đó
    if (localStorage.getItem('termsAccepted') === 'true') {
        checkboxes.forEach(checkbox => {
            checkbox.checked = true;
        });
        checkTerms();
    }

    // Thêm hiệu ứng hover cho các feature items
    document.querySelectorAll('.feature-item').forEach(item => {
        item.addEventListener('mouseenter', () => {
            item.style.transform = 'scale(1.1)';
        });
        item.addEventListener('mouseleave', () => {
            item.style.transform = 'scale(1)';
        });
    });

    document.querySelector('.logo').addEventListener('click', () => {
        window.location.href = './index.html';
    });
}); 