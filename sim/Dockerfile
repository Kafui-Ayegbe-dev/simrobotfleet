# RoboOps simulation image (ARM64-friendly, works on Apple Silicon)
# Everything ROS-side is baked in here, so recreating the container
# no longer means reinstalling packages.
FROM tiryoh/ros2-desktop-vnc:humble

ENV TURTLEBOT3_MODEL=burger

RUN apt-get update && apt-get install -y --no-install-recommends \
      ros-humble-rosbridge-suite \
      ros-humble-turtlebot3-fake-node \
      ros-humble-turtlebot3-description \
      ros-humble-robot-state-publisher \
      ros-humble-rviz2 \
    && rm -rf /var/lib/apt/lists/*

COPY roboops_sim.launch.py /opt/roboops/roboops_sim.launch.py

# Convenience: `start-sim` from any terminal inside the VNC desktop
RUN echo 'source /opt/ros/humble/setup.bash' >> /etc/bash.bashrc && \
    echo 'alias start-sim="ros2 launch /opt/roboops/roboops_sim.launch.py"' >> /etc/bash.bashrc && \
    echo 'alias start-sim-headless="ros2 launch /opt/roboops/roboops_sim.launch.py rviz:=false"' >> /etc/bash.bashrc
