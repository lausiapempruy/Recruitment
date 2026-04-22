class RecruitmentSystem {
    constructor() {
        this.isAdmin = false;
        this.recruitments = JSON.parse(localStorage.getItem('recruitments')) || [];
        this.applications = JSON.parse(localStorage.getItem('applications')) || [];
        this.adminPassword = 'admin123';
        
        this.init();
    }
 
    init() {
        this.bindEvents();
        this.renderPublic();
        this.hideLoader();
        this.startParticles();
        this.observeScroll();
    }

    bindEvents() {
        // Auth
        document.getElementById('adminAccessBtn').onclick = () => this.showAuthModal();
        document.getElementById('loginBtn').onclick = () => this.login();
        document.querySelectorAll('.close-modal').forEach(btn => {
            btn.onclick = () => this.closeModal();
        });

        // Navigation
        document.getElementById('adminBtn').onclick = () => this.showAdmin();
        document.getElementById('logoutBtn').onclick = () => this.logout();

        // Forms
        document.getElementById('recruitmentForm').onsubmit = (e) => this.createRecruitment(e);
        document.getElementById('cancelCreate').onclick = () => this.toggleCreateForm();
        document.getElementById('createRecBtn').onclick = () => this.toggleCreateForm();

        document.getElementById('applyForm').onsubmit = (e) => this.submitApplication(e);

        // Tabs
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.onclick = () => this.switchTab(btn.dataset.tab);
        });

        // Window events
        window.onresize = () => this.resizeCanvas();
    }

    // Auth System
    showAuthModal() {
        document.getElementById('authModal').classList.add('active');
    }

    closeModal() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.classList.remove('active');
        });
    }

    login() {
        const password = document.getElementById('adminPass').value;
        if (password === this.adminPassword) {
            this.isAdmin = true;
            this.closeModal();
            this.showAdmin();
            this.updateAdminUI();
        } else {
            this.shakeInput();
        }
    }

    shakeInput() {
        const input = document.getElementById('adminPass');
        input.style.animation = 'shake 0.5s ease-in-out';
        setTimeout(() => input.style.animation = '', 500);
    }

    // Mode Switching
    showAdmin() {
        document.getElementById('publicMode').style.display = 'none';
        document.getElementById('adminMode').style.display = 'block';
        document.getElementById('navbar').classList.add('admin-nav');
        this.renderAdmin();
    }

    logout() {
        this.isAdmin = false;
        document.getElementById('publicMode').style.display = 'block';
        document.getElementById('adminMode').style.display = 'none';
        document.getElementById('navbar').classList.remove('admin-nav');
        document.getElementById('adminBtn').style.display = 'none';
        document.getElementById('logoutBtn').style.display = 'none';
        this.renderPublic();
    }

    updateAdminUI() {
        document.getElementById('adminBtn').style.display = 'block';
        document.getElementById('logoutBtn').style.display = 'block';
    }

    // Public Rendering
    renderPublic() {
        this.updateStats();
        this.renderRecruitments();
    }

    updateStats() {
        document.getElementById('recruitmentCount').textContent = this.recruitments.filter(r => 
            new Date(r.endDate) >= new Date()
        ).length;

        document.getElementById('totalApps').textContent = this.applications.length;
        document.getElementById('activeRec').textContent = this.recruitments.filter(r => 
            new Date(r.endDate) >= new Date()
        ).length;
    }

    renderRecruitments() {
        const container = document.getElementById('recruitmentList');
        const activeRec = this.recruitments.filter(r => new Date(r.endDate) >= new Date());

        if (activeRec.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-briefcase"></i>
                    <h3>Belum ada recruitment aktif</h3>
                    <p>Stay tuned untuk lowongan terbaru dari Elite Team!</p>
                </div>
            `;
            return;
        }

        container.innerHTML = activeRec.map(rec => `
            <div class="recruitment-card fade-in" data-rec-id="${rec.id}" onclick="recruitmentSystem.showRecruitment('${rec.id}')">
                <div class="rec-type ${rec.type}">${rec.type.replace(/^\w/, c => c.toUpperCase())}</div>
                <h3>${rec.name}</h3>
                <p>${rec.description.substring(0, 100)}...</p>
                <div class="rec-meta">
                    <span>Difficulty: <strong>${rec.difficulty.toUpperCase()}</strong></span>
                    <span class="rec-deadline">
                        <i class="fas fa-clock"></i> Ends ${new Date(rec.endDate).toLocaleDateString('id-ID')}
                    </span>
                    <span>${rec.applications?.length || 0}/${rec.maxApps} applicants</span>
                </div>
            </div>
        `).join('');
    }

    showRecruitment(id) {
        const rec = this.recruitments.find(r => r.id === id);
        if (!rec || new Date(rec.endDate) < new Date()) return;

        document.getElementById('modalTitle').textContent = rec.name;
        document.getElementById('recDetails').innerHTML = `
            <div style="margin-bottom: 2rem; padding: 1.5rem; background: rgba(255,255,255,0.05); border-radius: 12px;">
                <div style="display: flex; gap: 1rem; margin-bottom: 1rem;">
                    <div class="rec-type ${rec.type}" style="font-size: 0.9rem; padding: 0.5rem 1rem;">${rec.type.replace(/^\w/, c =>                 c.toUpperCase())}</div>
                    <span style="padding: 0.5rem 1rem; background: rgba(255,255,255,0.1); border-radius: 20px; font-size: 0.8rem;">
                        ${rec.difficulty.toUpperCase()}
                    </span>
                </div>
                <p style="margin-bottom: 1rem; opacity: 0.9;">${rec.description}</p>
                <div style="display: flex; gap: 2rem; font-size: 0.9rem; opacity: 0.8;">
                    <span>Max Applicants: ${rec.maxApps}</span>
                    <span>Applied: ${rec.applications?.length || 0}</span>
                    <span>Deadline: ${new Date(rec.endDate).toLocaleDateString('id-ID')}</span>
                </div>
            </div>
        `;

        document.getElementById('recModal').classList.add('active');
        document.getElementById('applyForm').dataset.recId = id;
    }

    // Admin Rendering
    renderAdmin() {
        this.renderAdminStats();
        this.renderAdminRecruitments();
        this.renderApplications('pending');
        this.autoModerate();
    }

    renderAdminStats() {
        document.getElementById('adminTotalRec').textContent = this.recruitments.length;
        document.getElementById('adminActiveRec').textContent = this.recruitments.filter(r => 
            new Date(r.endDate) >= new Date()
        ).length;
        document.getElementById('adminTotalApps').textContent = this.applications.length;
    }

    toggleCreateForm() {
        const form = document.getElementById('createForm');
        form.style.display = form.style.display === 'none' ? 'block' : 'none';
    }

    createRecruitment(e) {
        e.preventDefault();
        const formData = {
            id: 'rec_' + Date.now(),
            name: document.getElementById('posName').value,
            type: document.getElementById('recType').value,
            description: document.getElementById('description').value,
            startDate: document.getElementById('startDate').value,
            endDate: document.getElementById('endDate').value,
            maxApps: parseInt(document.getElementById('maxApps').value),
            difficulty: document.getElementById('difficulty').value,
            applications: [],
            createdAt: new Date().toISOString()
        };

        this.recruitments.unshift(formData);
        this.saveData();
        this.renderPublic();
        this.renderAdminRecruitments();
        this.toggleCreateForm();
        e.target.reset();
        
        this.showNotification('Recruitment created successfully!', 'success');
    }

    renderAdminRecruitments() {
        const container = document.getElementById('adminRecruitmentList');
        container.innerHTML = this.recruitments.map(rec => `
            <div class="admin-rec-card fade-in">
                <div>
                    <div class="rec-type ${rec.type}">${rec.type.replace(/^\w/, c => c.toUpperCase())}</div>
                    <h4>${rec.name}</h4>
                    <p>${rec.applications?.length || 0}/${rec.maxApps} applicants</p>
                    <small>Ends: ${new Date(rec.endDate).toLocaleDateString('id-ID')}</small>
                </div>
                <div class="rec-actions">
                    ${new Date(rec.endDate) >= new Date() ? 
                        `<button class="rec-btn btn-warning" onclick="recruitmentSystem.editRecruitment('${rec.id}')">Edit</button>` : 
                        `<span style="color: #666; font-size: 0.8rem;">Expired</span>`
                    }
                    <button class="rec-btn btn-danger" onclick="recruitmentSystem.deleteRecruitment('${rec.id}')">
                        ${new Date(rec.endDate) >= new Date() ? 'Close' : 'Delete'}
                    </button>
                </div>
            </div>
        `).join('');
    }

    editRecruitment(id) {
        // Simple edit - reopen form with data
        const rec = this.recruitments.find(r => r.id === id);
        if (rec) {
            document.getElementById('posName').value = rec.name;
            document.getElementById('recType').value = rec.type;
            document.getElementById('description').value = rec.description;
            document.getElementById('startDate').value = rec.startDate.split('T')[0];
            document.getElementById('endDate').value = rec.endDate.split('T')[0];
            document.getElementById('maxApps').value = rec.maxApps;
            document.getElementById('difficulty').value = rec.difficulty;
            this.toggleCreateForm();
        }
    }

    deleteRecruitment(id) {
        if (confirm('Are you sure? This will delete all applications too.')) {
            this.recruitments = this.recruitments.filter(r => r.id !== id);
            this.applications = this.applications.filter(a => a.recId !== id);
            this.saveData();
            this.renderAdmin();
            this.renderPublic();
            this.showNotification('Recruitment deleted!', 'danger');
        }
    }

    submitApplication(e) {
        e.preventDefault();
        const recId = e.target.dataset.recId;
        const rec = this.recruitments.find(r => r.id === recId);

        if (!rec) return;

        // Check limits
        if (rec.applications?.length >= rec.maxApps) {
            alert('Maaf, kuota pendaftaran sudah penuh!');
            return;
        }

        if (new Date(rec.endDate) < new Date()) {
            alert('Maaf, masa pendaftaran sudah ditutup!');
            return;
        }

        const appData = {
            id: 'app_' + Date.now(),
            recId: recId,
            name: document.getElementById('appName').value,
            email: document.getElementById('appEmail').value,
            phone: document.getElementById('appPhone').value,
            discord: document.getElementById('appDiscord').value,
            why: document.getElementById('appWhy').value,
            exp: document.getElementById('appExp').value,
            status: 'pending',
            score: 0,
            appliedAt: new Date().toISOString(),
            moderatedAt: null
        };

        this.applications.push(appData);
        rec.applications.push(appData.id);
        this.saveData();
        this.renderPublic();
        this.renderAdmin();
        this.closeModal();
        
        this.showNotification('Application submitted! Awaiting moderation...', 'success');
    }

    // Moderation System (AI-like)
    autoModerate() {
        this.applications.forEach(app => {
            if (app.status === 'pending') {
                const score = this.calculateScore(app);
                app.score = score;

                if (score >= 85) {
                    app.status = 'approved';
                } else if (score >= 60) {
                    app.status = 'pending'; // Manual review
                } else {
                    app.status = 'rejected';
                }
                app.moderatedAt = new Date().toISOString();
            }
        });
        this.saveData();
    }

    calculateScore(app) {
        let score = 50; // Base score

        // Name quality
        if (app.name && app.name.length > 3) score += 5;

        // Email validity
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (emailRegex.test(app.email)) score += 10;

        // Experience quality
        const expWords = app.exp.toLowerCase().split(' ').filter(w => 
            ['html', 'css', 'js', 'react', 'node', 'python', 'java', 'experience', 'project'].includes(w)
        ).length;
        score += Math.min(expWords * 3, 20);

        // Motivation quality
        const whyWords = app.why.toLowerCase().split(' ').length;
        score += Math.min(whyWords * 0.5, 15);

        return Math.min(Math.round(score), 100);
    }

    switchTab(status) {
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        event.target.classList.add('active');
        this.renderApplications(status);
    }

    renderApplications(status) {
        const apps = this.applications.filter(a => a.status === status);
        const container = document.getElementById('applicationsList');

        // Update counts
        document.getElementById('pendingCount').textContent = this.applications.filter(a => a.status === 'pending').length;
        document.getElementById('approvedCount').textContent = this.applications.filter(a => a.status === 'approved').length;
        document.getElementById('rejectedCount').textContent = this.applications.filter(a => a.status === 'rejected').length;

        if (apps.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="grid-column: 1/-1;">
                    <i class="fas fa-inbox"></i>
                    <h3>Tidak ada ${status} applications</h3>
                </div>
            `;
            return;
        }

        container.innerHTML = apps.map(app => {
            const rec = this.recruitments.find(r => r.id === app.recId);
            return `
                <div class="app-card fade-in">
                    <div class="app-status status-${app.status}">
                        ${app.status.toUpperCase()}
                        ${app.score ? `(${app.score}%)` : ''}
                    </div>
                    <h4>${app.name}</h4>
                    <p><strong>${rec ? rec.name : 'Deleted Recruitment'}</strong></p>
                    <div style="font-size: 0.9rem; opacity: 0.8; margin: 1rem 0;">
                        <div>Email: ${app.email}</div>
                        ${app.discord ? `<div>Discord: ${app.discord}</div>` : ''}
                        <div>Applied: ${new Date(app.appliedAt).toLocaleDateString('id-ID')}</div>
                    </div>
                    <div class="app-actions">
                        ${app.status === 'pending' ? `
                            <button class="rec-btn btn-success" onclick="recruitmentSystem.approveApp('${app.id}')">Approve</button>
                            <button class="rec-btn btn-danger" onclick="recruitmentSystem.rejectApp('${app.id}')">Reject</button>
                        ` : `
                            <span style="color: #666;">Action completed</span>
                        `}
                    </div>
                </div>
            `;
        }).join('');
    }

    approveApp(id) {
        const app = this.applications.find(a => a.id === id);
        if (app) {
            app.status = 'approved';
            app.moderatedAt = new Date().toISOString();
            this.saveData();
            this.renderApplications(app.status);
            this.showNotification('Application approved!', 'success');
        }
    }

    rejectApp(id) {
        const app = this.applications.find(a => a.id === id);
        if (app) {
            app.status = 'rejected';
            app.moderatedAt = new Date().toISOString();
            this.saveData();
            this.renderApplications(app.status);
            this.showNotification('Application rejected', 'danger');
        }
    }

    // Data Persistence
    saveData() {
        localStorage.setItem('recruitments', JSON.stringify(this.recruitments));
        localStorage.setItem('applications', JSON.stringify(this.applications));
    }

    // UI Utilities
    showNotification(message, type = 'info') {
        // Simple toast notification
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            top: 100px;
            right: 20px;
            padding: 1rem 2rem;
            background: ${type === 'success' ? 'var(--success-gradient)' : type === 'danger' ? 'var(--danger-gradient)' : 'var(--primary-gradient)'};
            color: white;
            border-radius: 10px;
            z-index: 3000;
            transform: translateX(400px);
            transition: transform 0.3s ease;
            box-shadow: var(--shadow);
        `;
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.transform = 'translateX(0)';
        }, 100);

        setTimeout(() => {
            toast.style.transform = 'translateX(400px)';
            setTimeout(() => document.body.removeChild(toast), 300);
        }, 3000);
    }

    hideLoader() {
        setTimeout(() => {
            document.getElementById('loader').style.opacity = '0';
            setTimeout(() => document.getElementById('loader').style.display = 'none', 500);
        }, 1500);
    }

    // Particles
    startParticles() {
        const canvas = document.getElementById('particles');
        const ctx = canvas.getContext('2d');
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        const particles = [];
        for (let i = 0; i < 80; i++) {
            particles.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                vx: (Math.random() - 0.5) * 0.5,
                vy: (Math.random() - 0.5) * 0.5,
                radius: Math.random() * 2 + 1
            });
        }

        function animate() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            particles.forEach(p => {
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(102, 126, 234, 0.3)';
                ctx.fill();

                p.x += p.vx;
                p.y += p.vy;

                if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
                if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
            });

            requestAnimationFrame(animate);
        }
        animate();
    }

    resizeCanvas() {
        const canvas = document.getElementById('particles');
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }

    // Scroll Animations
    observeScroll() {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                }
            });
        }, { threshold: 0.1 });

        document.querySelectorAll('.fade-in').forEach(el => observer.observe(el));
    }
}

// Global recruitmentSystem instance
const recruitmentSystem = new RecruitmentSystem();

// Add shake animation to CSS (inline)
const style = document.createElement('style');
style.textContent = `
    @keyframes shake {
        0%, 100% { transform: translateX(0); }
        25% { transform: translateX(-5px); }
        75% { transform: translateX(5px); }
    }
    .admin-nav { background: rgba(10,10,10,0.95) !important; }
`;
document.head.appendChild(style);

console.log('🚀 Elite Recruitment System - Fully Loaded! 🔥');
