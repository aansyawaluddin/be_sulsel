export const DAY_MS = 24 * 60 * 60 * 1000;

export const getMidnightMs = (dateInput) => {
    if (!dateInput) return null;
    const d = new Date(dateInput);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return new Date(`${year}-${month}-${day}T00:00:00.000Z`).getTime();
};

export const addDaysMs = (ms, days) => {
    const d = new Date(ms);
    d.setDate(d.getDate() + days);
    return d.getTime();
};

export const hitungForecastPengadaan = (progresTahapanList) => {
    let prevEndDateMs = null;
    let pengadaanPlanEndMs = null;
    let pengadaanSelesai = true;
    let semuaSelesai = true;

    for (const tahapan of progresTahapanList) {
        if (tahapan.status !== 'selesai') {
            semuaSelesai = false;
            pengadaanSelesai = false;
        }

        const planStartMs = getMidnightMs(tahapan.planningTanggalMulai);
        const planEndMs = getMidnightMs(tahapan.planningTanggalSelesai);
        const aktualStartMs = getMidnightMs(tahapan.aktualTanggalMulai);
        const aktualEndMs = getMidnightMs(tahapan.aktualTanggalSelesai);

        if (planEndMs !== null) {
            if (pengadaanPlanEndMs === null || planEndMs > pengadaanPlanEndMs) {
                pengadaanPlanEndMs = planEndMs;
            }
        }

        if (!planStartMs || !planEndMs) continue;

        const planDurDays = Math.round((planEndMs - planStartMs) / DAY_MS);
        let forecastStartMs, forecastEndMs;

        if (aktualStartMs && aktualEndMs) {
            forecastStartMs = aktualStartMs;
            forecastEndMs = aktualEndMs;
        } else if (aktualStartMs && !aktualEndMs) {
            forecastStartMs = aktualStartMs;
            forecastEndMs = addDaysMs(aktualStartMs, planDurDays);
        } else {
            forecastStartMs = prevEndDateMs !== null
                ? addDaysMs(prevEndDateMs, 1)
                : planStartMs;
            forecastEndMs = addDaysMs(forecastStartMs, planDurDays);
        }

        prevEndDateMs = forecastEndMs;
    }

    return {
        forecastEndMs: prevEndDateMs,
        planEndMs: pengadaanPlanEndMs,
        pengadaanSelesai,
        semuaSelesai
    };
};