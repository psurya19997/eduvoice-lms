import { Routes, Route, Navigate } from 'react-router-dom';
import Welcome from './pages/Welcome.jsx';
import RoleSelect from './pages/RoleSelect.jsx';
import TeacherSignup from './pages/TeacherSignup.jsx';
import TeacherVerify from './pages/TeacherVerify.jsx';
import TeacherPassword from './pages/TeacherPassword.jsx';
import Pending from './pages/Pending.jsx';
import StudentSignup from './pages/StudentSignup.jsx';
import Login from './pages/Login.jsx';
import StudentForgotPassword from './pages/StudentForgotPassword.jsx';
import TeacherDashboard from './pages/TeacherDashboard.jsx';
import TeacherCourseNew from './pages/TeacherCourseNew.jsx';
import TeacherCourseDetail from './pages/TeacherCourseDetail.jsx';
import TeacherAssignmentNew from './pages/TeacherAssignmentNew.jsx';
import TeacherAssignmentDetail from './pages/TeacherAssignmentDetail.jsx';
import TeacherAssignmentSubmissions from './pages/TeacherAssignmentSubmissions.jsx';
import StudentDashboard from './pages/StudentDashboard.jsx';
import StudentCourseDetail from './pages/StudentCourseDetail.jsx';
import StudentAssignmentDetail from './pages/StudentAssignmentDetail.jsx';
import StudentAssignmentSubmit from './pages/StudentAssignmentSubmit.jsx';
import StudentLeaderboard from './pages/StudentLeaderboard.jsx';
import PhoneFrame from './components/PhoneFrame.jsx';
import StudentBadges from './pages/StudentBadges.jsx';
import StudentProfile from './pages/StudentProfile.jsx';
import TeacherProfile from './pages/TeacherProfile.jsx';
import SchoolCourses from './pages/SchoolCourses.jsx';
import SchoolCourseDetail from './pages/SchoolCourseDetail.jsx';
import SchoolAssignmentSubmissions from './pages/SchoolAssignmentSubmissions.jsx';
import PrincipalDashboard from './pages/PrincipalDashboard.jsx';
import PrincipalTeachers from './pages/PrincipalTeachers.jsx';
import PrincipalCourses from './pages/PrincipalCourses.jsx';
import PrincipalRequests from './pages/PrincipalRequests.jsx';
import PrincipalSettings from './pages/PrincipalSettings.jsx';
import PrincipalStudents from './pages/PrincipalStudents.jsx';
import GamesHub from './pages/GamesHub.jsx';
import WFHub from './pages/WFHub.jsx';
import WFSession from './pages/WFSession.jsx';
import SBHub from './pages/SBHub.jsx';
import SBSession from './pages/SBSession.jsx';
import STHub from './pages/STHub.jsx';
import STSession from './pages/STSession.jsx';
import STComplete from './pages/STComplete.jsx';
import STPractice from './pages/STPractice.jsx';
import STBonus from './pages/STBonus.jsx';

// Placeholder — each real screen will replace this as we build.
function Placeholder({ title }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-6 gap-2">
      <div className="text-5xl">🚧</div>
      <h2 className="text-xl font-extrabold text-slate-800">{title}</h2>
      <p className="text-sm font-medium text-slate-500">Coming up next.</p>
    </div>
  );
}

export default function App() {
  return (
    <PhoneFrame>
      <Routes>
        <Route path="/" element={<Welcome />} />
        <Route path="/signup" element={<RoleSelect />} />
        <Route path="/signup/teacher" element={<TeacherSignup />} />
        <Route path="/signup/teacher/verify" element={<TeacherVerify />} />
        <Route path="/signup/teacher/password" element={<TeacherPassword />} />
	<Route path="/teacher/profile" element={<TeacherProfile />} />
        <Route path="/signup/student" element={<StudentSignup />} />
	<Route path="/forgot-password" element={<StudentForgotPassword />} />
        <Route path="/login" element={<Login />} />
        <Route path="/pending" element={<Pending />} />
        <Route path="/teacher" element={<TeacherDashboard />} />
        <Route path="/teacher/courses/new" element={<TeacherCourseNew />} />
        <Route path="/teacher/courses/:id" element={<TeacherCourseDetail />} />
        <Route path="/teacher/assignments/new" element={<TeacherAssignmentNew />} />
        <Route path="/teacher/assignments/:id" element={<TeacherAssignmentDetail />} />
        <Route path="/teacher/assignments/:id/submissions" element={<TeacherAssignmentSubmissions />} />
        <Route path="/teacher/school" element={<SchoolCourses />} />
        <Route path="/teacher/school/courses/:id" element={<SchoolCourseDetail />} />
        <Route path="/teacher/school/assignments/:id/submissions" element={<SchoolAssignmentSubmissions />} />
        <Route path="/student" element={<StudentDashboard />} />
	<Route path="/student/courses/:id" element={<StudentCourseDetail />} />
        <Route path="/student/assignments/:id" element={<StudentAssignmentDetail />} />
        <Route path="/student/assignments/:id/submit" element={<StudentAssignmentSubmit />} />
        <Route path="/student/leaderboard" element={<StudentLeaderboard />} />
	<Route path="/student/games" element={<GamesHub />} />
	<Route path="/student/games/word-family" element={<WFHub />} />
	<Route path="/student/games/word-family/play" element={<WFSession />} />
	<Route path="/student/games/sentence-builder" element={<SBHub />} />
	<Route path="/student/games/sentence-builder/play" element={<SBSession />} />
	<Route path="/student/games/storyteller" element={<STHub />} />
	<Route path="/student/games/storyteller/play" element={<STSession />} />
	<Route path="/student/games/storyteller/practice" element={<STPractice />} />
	<Route path="/student/games/storyteller/bonus" element={<STBonus />} />
	<Route path="/student/games/storyteller/complete" element={<STComplete />} />
	<Route path="/student/badges" element={<StudentBadges />} />
	<Route path="/student/profile" element={<StudentProfile />} />
	<Route path="/principal" element={<PrincipalDashboard />} />
	<Route path="/principal/teachers" element={<PrincipalTeachers />} />
	<Route path="/principal/students" element={<PrincipalStudents />} />
	<Route path="/principal/courses" element={<PrincipalCourses />} />
	<Route path="/principal/requests" element={<PrincipalRequests />} />
	<Route path="/principal/settings" element={<PrincipalSettings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </PhoneFrame>
  );
}
