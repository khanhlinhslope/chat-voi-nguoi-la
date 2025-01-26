document.addEventListener('DOMContentLoaded', () => {
    const videoButton = document.getElementById('startVideoChat');
    const textButton = document.getElementById('startTextChat');
    const termsPopup = document.getElementById('termsPopup');
    const acceptTermsBtn = document.getElementById('acceptTerms');
    const cancelTermsBtn = document.getElementById('cancelTerms');
    const popupCheckboxes = document.querySelectorAll('.terms-popup .term-item input[type="checkbox"]');
    const termsLink = document.querySelector('.terms-link');
    const privacyLink = document.querySelector('.privacy-link');
    
    // Thêm animation cho các section
    document.querySelectorAll('section').forEach((section, index) => {
        section.style.animationDelay = `${index * 0.1}s`;
    });

    // Enable buttons by default
    videoButton.disabled = false;
    textButton.disabled = false;
    videoButton.classList.add('ready');
    textButton.classList.add('ready');

    let currentChatMode = ''; // Biến để lưu loại chat được chọn

    // Xử lý khi nhấn nút video chat
    videoButton.addEventListener('click', () => {
        currentChatMode = 'video';
        showTermsPopup();
    });

    // Xử lý khi nhấn nút text chat
    textButton.addEventListener('click', () => {
        currentChatMode = 'text';
        showTermsPopup();
    });

    // Hàm hiển thị popup
    function showTermsPopup() {
        termsPopup.style.display = 'block';
        document.body.style.overflow = 'hidden';
        // Reset checkboxes khi mở popup
        popupCheckboxes.forEach(checkbox => checkbox.checked = false);
        acceptTermsBtn.disabled = true;
    }

    // Hàm đóng popup và reset form
    function closePopup() {
        termsPopup.style.display = 'none';
        document.body.style.overflow = 'auto';
        popupCheckboxes.forEach(checkbox => checkbox.checked = false);
        acceptTermsBtn.disabled = true;
        currentChatMode = ''; // Reset chat mode
    }

    // Xử lý khi nhấn cancel
    cancelTermsBtn.addEventListener('click', () => {
        closePopup();
    });

    // Kiểm tra trạng thái checkboxes trong popup
    function checkPopupTerms() {
        const allChecked = Array.from(popupCheckboxes).every(checkbox => checkbox.checked);
        acceptTermsBtn.disabled = !allChecked;
    }

    // Thêm event listener cho các checkbox trong popup
    popupCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', checkPopupTerms);
    });

    // Xử lý khi nhấn accept
    acceptTermsBtn.addEventListener('click', () => {
        localStorage.setItem('termsAccepted', 'true');
        localStorage.setItem('chatMode', currentChatMode);
        closePopup();
        startChat(currentChatMode === 'video' ? videoButton : textButton);
    });

    // Close popup when clicking outside
    termsPopup.addEventListener('click', (e) => {
        if (e.target === termsPopup) {
            closePopup();
        }
    });

    function startChat(button) {
        // Hiển thị loading overlay
        const loadingOverlay = document.getElementById('loadingOverlay');
        loadingOverlay.style.display = 'block';
        document.body.style.overflow = 'hidden';

        // Disable button
        button.disabled = true;

        // Redirect sau 1 giây
        setTimeout(() => {
            loadingOverlay.style.display = 'none';
            document.body.style.overflow = 'auto';
            button.disabled = false;
            window.location.href = './chat.html';
        }, 1000);
    }

    // Xử lý các liên kết terms và privacy
    termsLink.addEventListener('click', () => {
        localStorage.setItem('lastPage', window.location.href);
    });

    privacyLink.addEventListener('click', () => {
        localStorage.setItem('lastPage', window.location.href);
    });

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