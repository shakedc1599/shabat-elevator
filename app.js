class ShabatElevator {
    constructor() {
        this.config = {
            totalFloors: 21,
            floorTravelTime: 3000, // 3 seconds per floor
            stopTime: 30000, // 30 seconds
            oddStopFloors: [21, 19, 17, 15, 13, 11, 9, 7, 5, 3, 1, 0],
            inactiveStart: 0, // 12 AM
            inactiveEnd: 6, // 6 AM
        };

        this.state = {
            syncTimestamp: Date.now(),
            syncFloor: 0,
            syncDirection: 'UP' // 'UP' or 'DOWN'
        };

        this.loadSettings();
        this.initUI();
        this.startEngine();
    }

    loadSettings() {
        const saved = localStorage.getItem('shabat_elevator_settings');
        if (saved) {
            const data = JSON.parse(saved);
            this.config = { ...this.config, ...data.config };
            this.state = { ...this.state, ...data.state };
        }
    }

    saveSettings() {
        localStorage.setItem('shabat_elevator_settings', JSON.stringify({
            config: this.config,
            state: this.state
        }));
    }

    initUI() {
        const building = document.getElementById('building');
        // Clear except elevator car
        const car = document.getElementById('elevator-car');
        building.innerHTML = '';
        building.appendChild(car);

        for (let i = 0; i <= this.config.totalFloors; i++) {
            const floor = document.createElement('div');
            floor.className = 'floor';
            floor.id = `floor-${i}`;
            if (this.config.oddStopFloors.includes(i)) {
                floor.classList.add('stop-floor');
            }
            floor.innerHTML = `<span class="floor-number">${i}</span>`;
            building.appendChild(floor);
        }

        document.getElementById('btn-sync').onclick = () => this.showSyncModal();
        document.getElementById('btn-fullscreen').onclick = () => this.toggleFullscreen();
    }

    calculateCurrentState() {
        const now = Date.now();
        const hour = new Date().getHours();

        // Check inactive period
        if (hour >= this.config.inactiveStart && hour < this.config.inactiveEnd) {
            return { isInactive: true };
        }

        const upTripTime = this.config.totalFloors * this.config.floorTravelTime;
        const downTripTime = (this.config.totalFloors * this.config.floorTravelTime) +
            (this.config.oddStopFloors.length * this.config.stopTime);
        const fullCycleTime = upTripTime + downTripTime;

        // Find offset from sync point
        let msSinceSync = now - this.state.syncTimestamp;

        // Adjust for initial sync state (simplification: assume sync happened at start of a state)
        // If sync was at floor X going UP:
        let initialOffset = 0;
        if (this.state.syncDirection === 'UP') {
            initialOffset = this.state.syncFloor * this.config.floorTravelTime;
        } else {
            // Complex case: sync during DOWN trip
            // For now, let's assume sync always sets start of a movement/stop
            initialOffset = upTripTime + ((21 - this.state.syncFloor) * this.config.floorTravelTime);
            // Add stops already passed
            const passedStops = this.config.oddStopFloors.filter(f => f > this.state.syncFloor).length;
            initialOffset += passedStops * this.config.stopTime;
        }

        let totalMs = (msSinceSync + initialOffset) % fullCycleTime;

        // Determine where we are in the cycle
        if (totalMs < upTripTime) {
            // Going UP
            const floor = totalMs / this.config.floorTravelTime;
            return { floor: floor, direction: 'UP', status: 'עולה ישר' };
        } else {
            // Going DOWN
            let downMs = totalMs - upTripTime;
            let currentDownMs = 0;

            for (let i = 0; i < this.config.oddStopFloors.length; i++) {
                const targetFloor = this.config.oddStopFloors[i];
                const prevFloor = (i === 0) ? 21 : this.config.oddStopFloors[i - 1];

                // Travel to this floor
                const travelToFloor = (prevFloor - targetFloor) * this.config.floorTravelTime;
                if (downMs < currentDownMs + travelToFloor) {
                    const progress = (downMs - currentDownMs) / this.config.floorTravelTime;
                    return { floor: prevFloor - progress, direction: 'DOWN', status: 'בתנועה' };
                }
                currentDownMs += travelToFloor;

                // Stop at this floor
                if (downMs < currentDownMs + this.config.stopTime) {
                    return { floor: targetFloor, direction: 'DOWN', status: 'עצירה (30 שנ\')' };
                }
                currentDownMs += this.config.stopTime;
            }
        }

        return { floor: 0, direction: 'UP', status: 'מתחיל מחזור' };
    }

    updateUI() {
        const state = this.calculateCurrentState();
        const overlay = document.getElementById('inactive-overlay');

        if (state.isInactive) {
            overlay.style.display = 'flex';
            return;
        } else {
            overlay.style.display = 'none';
        }

        const floorVal = typeof state.floor === 'number' ? state.floor.toFixed(1) : '--';
        document.getElementById('current-floor').innerText = Math.round(state.floor);
        document.getElementById('direction').innerText = state.direction === 'UP' ? '⬆️ עליה' : '⬇️ ירידה';
        document.getElementById('status-text').innerText = state.status;

        // Move elevator car
        const car = document.getElementById('elevator-car');
        const floorHeight = 60; // matches CSS
        car.style.bottom = `${(state.floor * floorHeight) + 32}px`;

        // Highlight floor
        document.querySelectorAll('.floor').forEach(f => f.classList.remove('active'));
        const activeFloorEl = document.getElementById(`floor-${Math.round(state.floor)}`);
        if (activeFloorEl) activeFloorEl.classList.add('active');
    }

    startEngine() {
        setInterval(() => this.updateUI(), 100);
    }

    showSyncModal() {
        // Simple prompt for now, but in a real app we'd use the modal HTML
        const floor = prompt("באיזו קומה המעלית עכשיו? (0-21)", "0");
        if (floor === null) return;
        const dir = confirm("האם היא בעליה? (OK לעליה, Cancel לירידה)") ? 'UP' : 'DOWN';

        this.state.syncTimestamp = Date.now();
        this.state.syncFloor = parseInt(floor);
        this.state.syncDirection = dir;
        this.saveSettings();
    }

    showSettings() {
        const newTime = prompt("כמה שניות לוקח למעלית לעבור קומה?", (this.config.floorTravelTime / 1000).toString());
        if (newTime) {
            this.config.floorTravelTime = parseFloat(newTime) * 1000;
            this.saveSettings();
        }
    }

    toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(e => {
                alert(`Error: ${e.message}`);
            });
        } else {
            document.exitFullscreen();
        }
    }
}

window.onload = () => {
    const app = new ShabatElevator();
    document.getElementById('btn-settings').onclick = () => app.showSettings();
};
