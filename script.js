// script.js
document.addEventListener('DOMContentLoaded', () => {
    // --- Element Selectors ---
    const segmentCountInput = document.getElementById('segment-count');
    const generateTableBtn = document.getElementById('generate-table-btn');
    const calculateBtn = document.getElementById('calculate-btn');
    const inputTableContainer = document.getElementById('input-table-container');
    const resultsTableBody = document.getElementById('results-table-body');
    const errorMagnitudeEl = document.getElementById('error-magnitude');
    const errorBearingEl = document.getElementById('error-bearing');
    const spinner = document.getElementById('spinner');
    const tabNav = document.querySelector('.tab-nav');
    const tabPanes = document.querySelectorAll('.tab-pane');
    const traversePlotDiv = document.getElementById('traverse-plot');
    const bowditchPlotDiv = document.getElementById('bowditch-plot');

    // --- Helper Functions ---
    const degToRad = (deg) => deg * (Math.PI / 180);
    const radToDeg = (rad) => rad * (180 / Math.PI);
    const sum = (arr) => arr.reduce((acc, val) => acc + val, 0);
    const cumsum = (arr) => {
        let sum = 0;
        return arr.map(val => sum += val);
    };

    // --- Tab Switching Logic ---
    tabNav.addEventListener('click', (e) => {
        const clickedTab = e.target.closest('.tab-link');
        if (!clickedTab) return;

        document.querySelectorAll('.tab-link').forEach(tab => tab.classList.remove('active'));
        tabPanes.forEach(pane => pane.classList.remove('active'));

        const tabId = clickedTab.dataset.tab;
        const activePane = document.getElementById(tabId);
        clickedTab.classList.add('active');
        activePane.classList.add('active');

        if (tabId === 'tab-traverse') {
            Plotly.Plots.resize(traversePlotDiv);
        } else if (tabId === 'tab-bowditch') {
            Plotly.Plots.resize(bowditchPlotDiv);
        }
    });

    // --- Initial Setup ---
    generateInputTable();
    generateTableBtn.addEventListener('click', generateInputTable);
    calculateBtn.addEventListener('click', calculateTraverse);
    
    // --- Main Functions ---

    function generateInputTable() {
        const count = parseInt(segmentCountInput.value, 10);
        if (count < 2 || count > 20) {
            alert("Please enter a number of segments between 2 and 20.");
            return;
        }

        let tableHtml = '<table><thead><tr><th>Line</th><th>Length (m)</th><th>Bearing (WCB °)</th></tr></thead><tbody>';
        
        // The defaultData array has been removed.
        // The loop now generates empty input fields.
        for (let i = 0; i < count; i++) {
            const lineLabel = `${String.fromCharCode(65 + i)}-${String.fromCharCode(65 + i + 1)}`;
            tableHtml += `
                <tr>
                    <td>${lineLabel}</td>
                    <td><input type="number" class="length-input" value="" step="0.01" required></td>
                    <td><input type="number" class="bearing-input" value="" step="0.01" required></td>
                </tr>
            `;
        }
        tableHtml += '</tbody></table>';
        inputTableContainer.innerHTML = tableHtml;
    }

    //
    // THIS IS THE REIMPLEMENTED FUNCTION
    // It no longer uses fetch(), but does the math directly.
    //
    function calculateTraverse() {
        const lengthInputs = document.querySelectorAll('.length-input');
        const bearingInputs = document.querySelectorAll('.bearing-input');
        
        spinner.style.display = 'block';
        calculateBtn.disabled = true;

        try {
            // 1. Read and validate input data
            const lengths = [];
            const bearings_deg = [];
            for (let i = 0; i < lengthInputs.length; i++) {
                const lengthVal = parseFloat(lengthInputs[i].value);
                const bearingVal = parseFloat(bearingInputs[i].value);
                if (isNaN(lengthVal) || isNaN(bearingVal)) {
                    throw new Error('Please fill in all length and bearing fields with valid numbers.');
                }
                lengths.push(lengthVal);
                bearings_deg.push(bearingVal);
            }

            // --- ALL CALCULATION LOGIC IS NOW HERE, IN JAVASCRIPT ---
            const labels = Array.from({ length: lengths.length }, (_, i) => `${String.fromCharCode(65 + i)}-${String.fromCharCode(65 + i + 1)}`);
            const bearings_rad = bearings_deg.map(degToRad);
            
            // Original Latitudes and Departures
            const latitudes = lengths.map((len, i) => len * Math.cos(bearings_rad[i]));
            const departures = lengths.map((len, i) => len * Math.sin(bearings_rad[i]));

            // Calculate closing error
            const error_latitude = sum(latitudes);
            const error_departure = sum(departures);
            const closing_error_mag = Math.sqrt(error_latitude**2 + error_departure**2);
            
            let closing_error_bearing_deg = 0;
            if (error_departure !== 0 || error_latitude !== 0) {
                let closing_error_bearing_rad = Math.atan2(error_departure, error_latitude);
                closing_error_bearing_deg = radToDeg(closing_error_bearing_rad);
                if (closing_error_bearing_deg < 0) closing_error_bearing_deg += 360;
            }

            const perimeter = sum(lengths);
            if (perimeter === 0) throw new Error("Perimeter cannot be zero.");

            // Unadjusted coordinates
            const unadjusted_x = [0, ...cumsum(departures)];
            const unadjusted_y = [0, ...cumsum(latitudes)];

            // Total corrections (opposite of error)
            const total_correction_dep = -error_departure;
            const total_correction_lat = -error_latitude;

            // Bowditch corrections for each station
            const cumulative_lengths = [0, ...cumsum(lengths)];
            const correction_fraction = cumulative_lengths.map(cum_len => cum_len / perimeter);
            const dep_correction_to_add = correction_fraction.map(frac => frac * total_correction_dep);
            const lat_correction_to_add = correction_fraction.map(frac => frac * total_correction_lat);

            // Adjusted coordinates
            let adjusted_x = unadjusted_x.map((x, i) => x + dep_correction_to_add[i]);
            let adjusted_y = unadjusted_y.map((y, i) => y + lat_correction_to_add[i]);

            // Force exact closure
            adjusted_x[adjusted_x.length - 1] = adjusted_x[0];
            adjusted_y[adjusted_y.length - 1] = adjusted_y[0];

            // Calculations for the results table
            const lat_line_correction = lengths.map(len => (len / perimeter) * total_correction_lat);
            const dep_line_correction = lengths.map(len => (len / perimeter) * total_correction_dep);
            const adj_lats = latitudes.map((lat, i) => lat + lat_line_correction[i]);
            const adj_deps = departures.map((dep, i) => dep + dep_line_correction[i]);
            const adj_lengths = adj_lats.map((lat, i) => Math.sqrt(lat**2 + adj_deps[i]**2));
            const adj_bearings_rad = adj_deps.map((dep, i) => Math.atan2(dep, adj_lats[i]));
            const adj_bearings_deg = adj_bearings_rad.map(radToDeg).map(deg => deg < 0 ? deg + 360 : deg);
            
            // Prepare table data
            const table_data = [];
            for (let i = 0; i < lengths.length; i++) {
                table_data.push({
                    line: labels[i],
                    orig_len: lengths[i].toFixed(3),
                    orig_brg: bearings_deg[i].toFixed(3),
                    lat_corr: lat_line_correction[i].toFixed(3),
                    dep_corr: dep_line_correction[i].toFixed(3),
                    adj_len: adj_lengths[i].toFixed(3),
                    adj_brg: adj_bearings_deg[i].toFixed(3)
                });
            }

            // Assemble the final results object, just like the Python server did
            const results = {
                error_info: {
                    magnitude: closing_error_mag.toFixed(3),
                    bearing: closing_error_bearing_deg.toFixed(2)
                },
                plot_data: {
                    unadjusted_x: unadjusted_x,
                    unadjusted_y: unadjusted_y,
                    adjusted_x: adjusted_x,
                    adjusted_y: adjusted_y,
                    lengths: lengths
                },
                bowditch_data: {
                    perimeter: perimeter,
                    cumulative_lengths: cumulative_lengths,
                    error_magnitude: closing_error_mag,
                },
                table_data: table_data
            };
            
            // Call the existing UI update function
            updateUI(results);

        } catch (error) {
            alert(`An error occurred: ${error.message}`);
        } finally {
            spinner.style.display = 'none';
            calculateBtn.disabled = false;
        }
    }

    function updateUI(results) {
        errorMagnitudeEl.textContent = results.error_info.magnitude;
        errorBearingEl.textContent = results.error_info.bearing;

        resultsTableBody.innerHTML = '';
        results.table_data.forEach(row => {
            const tr = document.createElement('tr');
            // Format signed numbers for corrections
            const latCorr = parseFloat(row.lat_corr) > 0 ? `+${row.lat_corr}` : row.lat_corr;
            const depCorr = parseFloat(row.dep_corr) > 0 ? `+${row.dep_corr}` : row.dep_corr;
            tr.innerHTML = `<td>${row.line}</td><td>${row.orig_len}</td><td>${row.orig_brg}</td><td>${latCorr}</td><td>${depCorr}</td><td>${row.adj_len}</td><td>${row.adj_brg}</td>`;
            resultsTableBody.appendChild(tr);
        });

        plotTraverse(results.plot_data, results.table_data);
        plotBowditchMethod(results.bowditch_data);

        document.querySelector('[data-tab="tab-traverse"]').click();
    }

    // --- Plotting Configuration and Functions (NO CHANGES NEEDED BELOW THIS LINE) ---

    const plotLayoutOptions = {
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        font: { color: 'var(--text-light)' },
        xaxis: { gridcolor: 'rgba(255,255,255,0.1)', zerolinecolor: 'rgba(255,255,255,0.1)' },
        yaxis: { gridcolor: 'rgba(255,255,255,0.1)', zerolinecolor: 'rgba(255,255,255,0.1)' },
        legend: { x: 1, xanchor: 'right', y: 1 },
        margin: { l: 60, r: 40, b: 50, t: 80 }
    };

    function plotTraverse(plotData, tableData) {
        const { unadjusted_x, unadjusted_y, adjusted_x, adjusted_y } = plotData;
        const stationChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

        const unadjustedLineColor = '#FFFFFF';
        const adjustedLineColor = '#32CD32';
        const stationAdjustmentLineColor = 'rgba(192,192,192,0.8)';

        const unadjustedTrace = {
            x: unadjusted_x, y: unadjusted_y, mode: 'lines+markers', name: 'Unadjusted',
            line: { color: unadjustedLineColor, dash: 'dash', width: 1.5 },
            marker: { size: 8, color: unadjustedLineColor },
        };

        const adjustedTrace = {
            x: adjusted_x, y: adjusted_y, mode: 'lines+markers', name: 'Adjusted',
            line: { color: adjustedLineColor, width: 3 },
            marker: { size: 9, color: adjustedLineColor },
        };
        
        const annotations = [];
        
        // --- Parallel labels for segments ---
        function createParallelLabel(x1, y1, x2, y2, labelText, color, offsetSign) {
            const dx = x2 - x1;
            const dy = y2 - y1;
            const angle = Math.atan2(dy, dx) * 180 / Math.PI;

            let xanchor, yanchor, xshift, yshift;
            const offset = 10;

            if (angle > -45 && angle <= 45) { 
                xanchor = 'center'; yanchor = 'top'; xshift = 0; yshift = -offset * offsetSign;
            } else if (angle > 45 && angle <= 135) { 
                xanchor = 'left'; yanchor = 'middle'; xshift = offset * offsetSign; yshift = 0;
            } else if (angle > 135 || angle <= -135) { 
                xanchor = 'center'; yanchor = 'bottom'; xshift = 0; yshift = offset * offsetSign;
            } else { 
                xanchor = 'right'; yanchor = 'middle'; xshift = -offset * offsetSign; yshift = 0;
            }

            return {
                x: (x1 + x2) / 2, y: (y1 + y2) / 2,
                text: labelText,
                showarrow: false, font: { color: color, size: 11 },
                xanchor: xanchor, yanchor: yanchor,
                xshift: xshift, yshift: yshift,
                bgcolor: 'rgba(0,0,0,0.6)',
                borderpad: 2,
            };
        }

        for (let i = 0; i < tableData.length; i++) {
            annotations.push(createParallelLabel(
                unadjusted_x[i], unadjusted_y[i], unadjusted_x[i+1], unadjusted_y[i+1],
                `${parseFloat(tableData[i].orig_len).toFixed(2)}m @ ${parseFloat(tableData[i].orig_brg).toFixed(2)}°`,
                '#FFFF00', -1
            ));

            annotations.push(createParallelLabel(
                adjusted_x[i], adjusted_y[i], adjusted_x[i+1], adjusted_y[i+1],
                `${parseFloat(tableData[i].adj_len).toFixed(2)}m @ ${parseFloat(tableData[i].adj_brg).toFixed(2)}°`,
                '#00FFFF', 1
            ));
        }
        
        // --- Station labels ---
        for (let i = 0; i < unadjusted_x.length; i++) {
            annotations.push({
                x: unadjusted_x[i], y: unadjusted_y[i], ax: 25, ay: -25,
                text: `<b>${i === unadjusted_x.length - 1 ? "A'" : stationChars[i]}</b>`,
                showarrow: false, font: { color: unadjustedLineColor, size: 14 }
            });
            if (i < adjusted_x.length - 1) {
                annotations.push({
                    x: adjusted_x[i], y: adjusted_y[i], ax: -25, ay: 25,
                    text: `<b>${i === 0 ? "A" : stationChars[i] + "'"}</b>`,
                    showarrow: false, font: { color: adjustedLineColor, size: 14 }
                });
            }
        }
        
        const adjustmentShapes = [];
        for (let i = 1; i < unadjusted_x.length - 1; i++) {
            adjustmentShapes.push({
                type: 'line', x0: unadjusted_x[i], y0: unadjusted_y[i],
                x1: adjusted_x[i], y1: adjusted_y[i],
                line: { color: stationAdjustmentLineColor, width: 1, dash: 'dot' }
            });
        }

        const dummyTrace = {
            x: [null], y: [null], mode: 'lines', name: 'Station Adjustment',
            line: { color: stationAdjustmentLineColor, width: 1, dash: 'dot' }
        };
        
        // --- Red error arrow A' -> A ---
        annotations.push({
            x: adjusted_x[adjusted_x.length-1], y: adjusted_y[adjusted_y.length-1],       // tip = A (adjusted last)
            ax: unadjusted_x[unadjusted_x.length-1], ay: unadjusted_y[unadjusted_y.length-1], // tail = A' (unadjusted last)
            xref: 'x', yref: 'y', axref: 'x', ayref: 'y',
            text: '', showarrow: true, arrowhead: 4, arrowsize: 1.2,
            arrowcolor: 'red', opacity: 0.95
        });

        const layout = {
            ...plotLayoutOptions,
            title: 'Survey Traverse Plot',
            xaxis: { ...plotLayoutOptions.xaxis, title: 'Departure (East-West)', scaleanchor: 'y', scaleratio: 1 },
            yaxis: { ...plotLayoutOptions.yaxis, title: 'Latitude (North-South)' },
            annotations: annotations,
            shapes: adjustmentShapes,
            dragmode: 'pan' 
        };

        const config = { responsive: true, scrollZoom: true };
        Plotly.newPlot(traversePlotDiv, [unadjustedTrace, adjustedTrace, dummyTrace], layout, config);
    }


    function plotBowditchMethod(data) {
        const { perimeter, cumulative_lengths, error_magnitude } = data;
        const correction_magnitudes = cumulative_lengths.map(len => (len / perimeter) * error_magnitude);
        const stationChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

        const mainTrace = {
            x: cumulative_lengths, y: correction_magnitudes, mode: 'lines+markers', name: 'Correction Magnitude',
            line: { color: 'var(--secondary)', width: 3 }
        };
        
        const shapes = [];
        const annotations = [];

        cumulative_lengths.forEach((len, i) => {
            shapes.push({
                type: 'line', x0: len, y0: 0, x1: len, y1: correction_magnitudes[i],
                line: { color: 'rgba(192,192,192,0.8)', width: 1, dash: 'dash' }
            });
            annotations.push({
                x: len, y: 0, ax: 0, ay: -30,
                text: `<b>${i === cumulative_lengths.length - 1 ? "A'" : stationChars[i]}</b>`,
                showarrow: false, font: {size: 14, color: '#FFFFFF'}
            });
        });

        const config = { responsive: true, scrollZoom: true };
        const layout = {
            ...plotLayoutOptions,
            title: "Bowditch's Correction vs. Length",
            xaxis: { ...plotLayoutOptions.xaxis, title: 'Cumulative Length (m)' },
            yaxis: { ...plotLayoutOptions.yaxis, title: 'Magnitude of Correction (m)', range: [0, error_magnitude * 1.2 || 1] },
            shapes: shapes,
            annotations: annotations,
            dragmode: 'pan'
        };

        Plotly.newPlot(bowditchPlotDiv, [mainTrace], layout, config);
    }
});
