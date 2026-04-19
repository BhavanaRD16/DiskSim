💽 DiskSim — HDD Scheduling Simulator

An interactive web application to visualize and compare disk scheduling algorithms with real-time animation and modern UI.

🚀 Features

📌 Supports multiple disk scheduling algorithms:
  FCFS (First Come First Served)
  SSTF (Shortest Seek Time First)
  SCAN (Elevator Algorithm)
  C-SCAN (Circular SCAN)
  LOOK
  C-LOOK (Circular LOOK)

🎬 Step-by-step disk head movement animation
📊 Accurate graph visualization with full disk range scaling
🧠 Interactive tooltip (hover/touch to inspect each step)
📈 Algorithm comparison based on total seek time
🎨 Modern UI with **Light & Dark mode toggle**
📥 Flexible input (supports comma and space-separated values)
✅ Input validation for correctness and robustness


🧾 Inputs
1. Request Queue
  Enter disk requests (comma or space separated)

2. Initial Head Position
  Starting position of the disk head

3. Disk Size
  Total number of cylinders (range: `0 → diskSize - 1`)

4. Direction
  Required for SCAN, C-SCAN, LOOK, and C-LOOK

📊 Output
* Execution order of requests
* Total seek time
* Animated graph showing head movement
* Interactive point details (track, step, movement)

🧠 Algorithms Implemented

| Algorithm | Description                                           |
| --------- | ----------------------------------------------------- |
| FCFS      | Processes requests in order of arrival                |
| SSTF      | Selects the nearest request to minimize seek time     |
| SCAN      | Moves in one direction, then reverses (elevator)      |
| C-SCAN    | Moves in one direction and jumps back to start        |
| LOOK      | SCAN but only goes till last request                  |
| C-LOOK    | Circular version of LOOK (jumps between request ends) |

📈 Visualization Details
* Graph scaled accurately from `0 → diskSize - 1`
* Points plotted using normalized coordinates
* Step-by-step animation with head movement
* Tooltip interaction for detailed inspection

🎨 UI/UX Highlights
* Clean dashboard-style layout
* Glassmorphism-inspired cards
* Gradient branding and modern typography
* Responsive and user-friendly design

🌐 Live Demo
https://disksim.onrender.com

🛠 Tech Stack
* HTML
* CSS
* JavaScript

📌 Purpose
This project was developed as an academic mini project to demonstrate disk scheduling concepts in Operating Systems through interactive visualization and simulation.

💡 Key Learning
* Understanding of disk scheduling algorithms
* Visualization of head movement and seek time optimization
* UI/UX design for educational tools
* Handling real-time animation and interaction
