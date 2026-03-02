class ShabatElevator {
    constructor() {
        this.config = {
            totalFloors: 21,
            floorTravelTime: 3000,
            stopTime: 30000,
            oddStopFloors: [21, 19, 17, 15, 13, 11, 9, 7, 5, 3, 1, 0],
            inactiveStart: 0,
            inactiveEnd: 6,
            myFloor: 0
        };

        this.state = {
            syncTimestamp: Date.now(),
            syncFloor: 0,
            syncDirection: 'UP'
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
        document.getElementById('btn-sync').onclick = () => this.showSyncModal();
        document.getElementById('btn-settings').onclick = () => this.showSettings();
        document.getElementById('btn-fullscreen').onclick = () => this.toggleFullscreen();
        document.getElementById('target-floor-label').innerText = this.config.myFloor;
    }

    calculateCurrentState(currentTime) {
        const now = currentTime || Date.now();
        const hour = new Date(now).getHours();

        if (hour >= this.config.inactiveStart && hour < this.config.inactiveEnd) {
            return { isInactive: true };
        }

        const upTripTime = this.config.totalFloors * this.config.floorTravelTime;
        const downTripTime = (this.config.totalFloors * this.config.floorTravelTime) +
            (this.config.oddStopFloors.length * this.config.stopTime);
        const fullCycleTime = upTripTime + downTripTime;

        let msSinceSync = now - this.state.syncTimestamp;
        let initialOffset = 0;
        if (this.state.syncDirection === 'UP') {
            initialOffset = this.state.syncFloor * this.config.floorTravelTime;
        } else {
            initialOffset = upTripTime + ((21 - this.state.syncFloor) * this.config.floorTravelTime);
            const passedStops = this.config.oddStopFloors.filter(f => f > this.state.syncFloor).length;
            initialOffset += passedStops * this.config.stopTime;
        }

        let totalMs = (msSinceSync + initialOffset) % fullCycleTime;

        if (totalMs < upTripTime) {
            return { floor: totalMs / this.config.floorTravelTime, direction: 'UP', status: 'עולה ישר', cycleTime: totalMs, fullCycleTime };
        } else {
            let downMs = totalMs - upTripTime;
            let currentDownMs = 0;
            for (let i = 0; i < this.config.oddStopFloors.length; i++) {
                const targetFloor = this.config.oddStopFloors[i];
                const prevFloor = (i === 0) ? 21 : this.config.oddStopFloors[i - 1];
                const travelToFloorTime = (prevFloor - targetFloor) * this.config.floorTravelTime;

                if (downMs < currentDownMs + travelToFloorTime) {
                    const progress = (downMs - currentDownMs) / this.config.floorTravelTime;
                    return { floor: prevFloor - progress, direction: 'DOWN', status: 'בתנועה', cycleTime: totalMs, fullCycleTime };
                }
                currentDownMs += travelToFloorTime;

                if (downMs < currentDownMs + this.config.stopTime) {
                    return { floor: targetFloor, direction: 'DOWN', status: 'עצירה', cycleTime: totalMs, fullCycleTime };
                }
                currentDownMs += this.config.stopTime;
            }
        }
        return { floor: 0, direction: 'UP', status: 'מתחיל', cycleTime: 0, fullCycleTime };
    }

    calculateTimeToFloor(targetFloor) {
        const now = Date.now();
        const currentState = this.calculateCurrentState(now);
        if (currentState.isInactive) return { time: null };

        let actualTarget = targetFloor;
        let note = "";

        // If target floor is not a stopping floor, target the one above it
        if (!this.config.oddStopFloors.includes(targetFloor)) {
            actualTarget = targetFloor + 1;
            note = `*מחושב לפי קומה ${actualTarget} (עצירה קרובה)`;
        }

        const upTripTime = this.config.totalFloors * this.config.floorTravelTime;
        const step = 1000;
        let timeElapsed = 0;
        let checkMs = currentState.cycleTime;

        while (timeElapsed < currentState.fullCycleTime) {
            const simMs = (checkMs + timeElapsed) % currentState.fullCycleTime;
            let simFloor = 0;
            let isStopping = false;

            if (simMs < upTripTime) {
                simFloor = simMs / this.config.floorTravelTime;
            } else {
                let downMs = simMs - upTripTime;
                let cMs = 0;
                for (let i = 0; i < this.config.oddStopFloors.length; i++) {
                    const f = this.config.oddStopFloors[i];
                    const prevF = (i === 0) ? 21 : this.config.oddStopFloors[i - 1];
                    const tTime = (prevF - f) * this.config.floorTravelTime;
                    if (downMs < cMs + tTime) {
                        simFloor = prevF - ((downMs - cMs) / this.config.floorTravelTime);
                        break;
                    }
                    cMs += tTime;
                    if (downMs < cMs + this.config.stopTime) {
                        simFloor = f;
                        isStopping = true;
                        break;
                    }
                    cMs += this.config.stopTime;
                }
            }

            // ONLY count if it's the target floor AND it's a stop (on the way down)
            if (isStopping && Math.abs(simFloor - actualTarget) < 0.1) {
                return { time: timeElapsed, note: note };
            }
            timeElapsed += step;
        }
        return { time: null, note: "" };
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

        document.getElementById('floor-display').innerText = Math.round(state.floor);
        document.getElementById('direction-indicator').innerText = (state.direction === 'UP' ? 'עולה ↑' : 'יורד ↓') + ' (' + state.status + ')';

        const result = this.calculateTimeToFloor(this.config.myFloor);
        const timerEl = document.getElementById('target-timer');
        const noteEl = document.getElementById('timer-note');

        if (result.time !== null) {
            const mins = Math.floor(result.time / 60000);
            const secs = Math.floor((result.time % 60000) / 1000);
            timerEl.innerText = `${mins}:${secs.toString().padStart(2, '0')}`;
            noteEl.innerText = result.note;
        } else {
            timerEl.innerText = '--:--';
            noteEl.innerText = "";
        }
    }

    startEngine() {
        setInterval(() => this.updateUI(), 1000);
    }

    showSyncModal() {
        const floor = prompt("באיזו קומה המעלית עכשיו?", "21"); // Default to 21 for convenience
        if (floor === null) return;

        this.state.syncTimestamp = Date.now();
        this.state.syncFloor = parseInt(floor);
        this.state.syncDirection = 'DOWN'; // Always assume DOWN as requested
        this.saveSettings();
        alert("סונכרן בהצלחה! (המעלית הוגדרה במצב ירידה)");
    }

    showSettings() {
        const f = prompt("מה הקומה שלך? (להצגת הטיימר)", this.config.myFloor);
        if (f !== null) {
            this.config.myFloor = parseInt(f);
            document.getElementById('target-floor-label').innerText = f;
        }
        const t = prompt("זמן מעבר בין קומות (שניות):", (this.config.floorTravelTime / 1000).toString());
        if (t) this.config.floorTravelTime = parseFloat(t) * 1000;
        this.saveSettings();
    }

    toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => { });
        } else {
            document.exitFullscreen();
        }
    }
}

window.onload = () => new ShabatElevator();
