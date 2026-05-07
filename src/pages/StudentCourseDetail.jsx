import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import BackButton from '../components/BackButton.jsx';
import StudentBottomNav from '../components/StudentBottomNav.jsx';
import { supabase } from '../lib/supabase.js';
import { useAuthProfile } from '../lib/useAuthProfile.js';

export default function StudentCourseDetail() {
  const { id: courseId } = useParams();
  const { user, profile, loading: authLoading } = useAuthProfile('student');
  const [course, setCourse] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !profile || !courseId) return;
    (async () => {
      setLoading(true);

      const { data: c } = await supabase.from('courses').select('*').eq('id', courseId).single();
      setCourse(c);

      const { data: a } = await supabase
        .from('assignments')
        .select(`id, title, due_date, is_live, assignment_classes!inner(class)`)
        .eq('course_id', courseId)
        .eq('is_live', true)
        .eq('assignment_classes.class', profile.class);

      setAssignments(a || []);
      setLoading(false);
    })();
  }, [user, profile, courseId]);

  if (loading || authLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-50">
        <p className="font-bold text-slate-500">Loading Assignments...</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-slate-50 pb-[70px] overflow-y-auto">
      <header className="p-4 pt-6">
        <BackButton />
        <h1 className="text-[22px] font-black text-slate-900 mt-4">{course?.title}</h1>
        <p className="text-slate-500 font-bold text-[13px]">Select an assignment to begin</p>
      </header>

      <div className="px-4 space-y-3 mt-4">
        {assignments.length === 0 ? (
          <div className="bg-white p-8 rounded-3xl text-center ring-1 ring-slate-200">
            <p className="text-slate-400 font-bold">No assignments found for your class.</p>
          </div>
        ) : (
          assignments.map((asm) => (
            <Link
              key={asm.id}
              to={`/student/assignments/${asm.id}`}
              className="block bg-white p-5 rounded-3xl ring-1 ring-slate-200 shadow-sm active:scale-[0.98] transition-all"
            >
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-[16px] font-extrabold text-slate-900">{asm.title}</h3>
                  <p className="text-[11px] font-bold text-slate-400 mt-1 uppercase tracking-wider">
                    Due: {new Date(asm.due_date).toLocaleDateString()}
                  </p>
                </div>
                <div className="w-9 h-9 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600 font-bold">→</div>
              </div>
            </Link>
          ))
        )}
      </div>

      <StudentBottomNav />
    </div>
  );
}