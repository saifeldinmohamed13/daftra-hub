var isOwner = (typeof USER !== 'undefined' && USER && USER.is_owner);

if (isOwner) {
    setTimeout(function() {
        var mainNav = document.querySelector('.user-log ul');

        if (mainNav) {
            var bodyDir = document.body ? document.body.dir : '';
            var htmlDir = document.documentElement ? document.documentElement.dir : '';

            var isArabic = (bodyDir === 'rtl' || htmlDir === 'rtl') ? 1 : 0;

            // 2. تحديد النص بناءً على اللغة
            var labelText = isArabic ? 'لوحة التحليلات' : 'Analytics Dashboard';

            // 3. إنشاء عنصر القائمة بنفس كلاسات دفترة
            var newListItem = document.createElement('li');
            newListItem.className = 'dropdown res-right';

            // 4. إنشاء الرابط الرئيسي
            var newLink = document.createElement('a');
            newLink.className = 'px-0';
            newLink.href = 'http://localhost:5173/dashboard';
            newLink.target = '_blank';
            newLink.rel = 'noopener noreferrer';

            // 5. الحاوية الداخلية (Flex wrapper)
            var flexSpan = document.createElement('span');
            flexSpan.className = 'px-3 d-inline-flex align-content-center text-white';

            // 6. اختيار الأيقونة (mdi-chart-line: رسم بياني للتحليلات)
            var icon = document.createElement('i');
            icon.className = 'fs-20 mdi mdi-chart-line mr-lg-2';

            // 7. عنصر النص المترجم
            var textSpan = document.createElement('span');
            textSpan.className = 'visible-sm d-xl-inline-block text-nowrap';
            textSpan.textContent = labelText;

            // 8. تجميع العناصر وإدراجها
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