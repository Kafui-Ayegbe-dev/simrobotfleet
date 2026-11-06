"""
RoboOps simulation launch — replaces the old 4-terminal sequence.

Starts:
  1. turtlebot3_fake_node   (kinematic sim: /cmd_vel in, /odom + TF out)
  2. robot_state_publisher  (burger URDF, so RViz can draw the robot)
  3. rosbridge_websocket    (ws://0.0.0.0:9090, what the Node server talks to)
  4. rviz2                  (optional, rviz:=false to skip)
"""
import os

from ament_index_python.packages import get_package_share_directory
from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument, IncludeLaunchDescription
from launch.conditions import IfCondition
from launch.launch_description_sources import AnyLaunchDescriptionSource
from launch.substitutions import LaunchConfiguration
from launch_ros.actions import Node


def generate_launch_description():
    fake_share = get_package_share_directory("turtlebot3_fake_node")
    desc_share = get_package_share_directory("turtlebot3_description")
    bridge_share = get_package_share_directory("rosbridge_server")

    params_file = os.path.join(fake_share, "param", "burger.yaml")
    urdf_file = os.path.join(desc_share, "urdf", "turtlebot3_burger.urdf")
    rviz_file = os.path.join(desc_share, "rviz", "model.rviz")

    with open(urdf_file, "r") as f:
        robot_description = f.read()

    use_rviz = LaunchConfiguration("rviz")

    return LaunchDescription([
        DeclareLaunchArgument("rviz", default_value="true"),

        Node(
            package="turtlebot3_fake_node",
            executable="turtlebot3_fake_node",
            parameters=[params_file],
            output="screen",
        ),

        Node(
            package="robot_state_publisher",
            executable="robot_state_publisher",
            parameters=[{"robot_description": robot_description}],
            output="screen",
        ),

        IncludeLaunchDescription(
            AnyLaunchDescriptionSource(
                os.path.join(bridge_share, "launch", "rosbridge_websocket_launch.xml")
            ),
            launch_arguments={"port": "9090", "address": "0.0.0.0"}.items(),
        ),

        Node(
            package="rviz2",
            executable="rviz2",
            arguments=["-d", rviz_file],
            condition=IfCondition(use_rviz),
            output="screen",
        ),
    ])
