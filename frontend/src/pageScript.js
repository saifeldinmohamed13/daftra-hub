// Developer Portal

// Webhook endpoint: /api/webhooks/daftra
// Webhooks: {1- Invoice created, 2- Invoice deleted, 3- Client created, 4- Client updated, 5- Client deleted}

// Name: Add Analytics Dashboard Button for Owners
// URL: /

var isOwner = (typeof USER !== 'undefined' && USER && USER.is_owner);

if (isOwner) {
    setTimeout(function() {
        var mainNav = document.querySelector('.user-log ul');

        if (mainNav) {
            var bodyDir = document.body ? document.body.dir : '';
            var htmlDir = document.documentElement ? document.documentElement.dir : '';

            var isArabic = (bodyDir === 'rtl' || htmlDir === 'rtl') ? 1 : 0;

            var labelText = isArabic ? 'لوحة التحليلات' : 'Analytics Dashboard';

            var newListItem = document.createElement('li');
            newListItem.className = 'dropdown res-right';

            var newLink = document.createElement('a');
            newLink.className = 'px-0';
            newLink.href = 'http://localhost:5173/dashboard';
            newLink.target = '_blank';
            newLink.rel = 'noopener noreferrer';

            var flexSpan = document.createElement('span');
            flexSpan.className = 'px-3 d-inline-flex align-content-center text-white';

            var icon = document.createElement('i');
            icon.className = 'fs-20 mdi mdi-chart-line mr-lg-2';

            var textSpan = document.createElement('span');
            textSpan.className = 'visible-sm d-xl-inline-block text-nowrap';
            textSpan.textContent = labelText;

            flexSpan.appendChild(icon);
            flexSpan.appendChild(textSpan);
            newLink.appendChild(flexSpan);
            newListItem.appendChild(newLink);

            mainNav.insertBefore(newListItem, mainNav.firstChild);
        } else {
            console.error('Element .user-log ul is not available yet.');
        }
    }, 500);
}