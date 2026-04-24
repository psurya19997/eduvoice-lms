import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import BackButton from '../components/BackButton';

export default function PrincipalStudents() {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedClass, setSelectedClass] = useState('All');

  const classes = ['All', '1', '2', '3', '4', '5','6', '7', '8', '9', '10','11','12'];

  useEffect(() => {
    fetchStudents();
  }, [selectedClass]);

  async function fetchStudents() {
    setLoading(true);
    let query = supabase
      .from('profiles')
      .select('*')
      .eq('role', 'student')
      .order('first_name');

    if (selectedClass !== 'All') {
      query = query.eq('class', selectedClass);
    }

    const { data } = await query;
    setStudents(data || []);
    setLoading(false);
  }

  async function toggleStudentStatus(id, currentStatus) {
    const newStatus = !currentStatus;
    const { error } = await supabase
      .from('profiles')
      .update({ 
        is_active: newStatus,
        disabled_at: newStatus ? null : new Date().toISOString() 
      })
      .eq('id', id);

    if (!error) fetchStudents();
  }

  return (
    // Added h-screen and flex-col to fix the height to the viewport
    <div className="h-screen bg-slate-50 flex flex-col">
      
      {/* Header Section: Remains Fixed at top */}
      <div className="p-6 pb-2 bg-slate-50 z-10">
        <BackButton />
        <h1 className="text-2xl font-black text-slate-900 mt-4">Manage Students</h1>

        <div className="flex gap-2 overflow-x-auto py-4 no-scrollbar">
          {classes.map(c => (
            <button
              key={c}
              onClick={() => setSelectedClass(c)}
              className={`px-4 py-2 rounded-xl font-bold text-sm whitespace-nowrap transition ${
                selectedClass === c ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600'
              }`}
            >
              Class {c}
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable List Area: This ensures students aren't omitted */}
      <div className="flex-1 overflow-y-auto px-6 pb-10">
        {loading ? (
          <div className="text-center py-10 font-bold text-slate-400 animate-pulse">Loading students...</div>
        ) : students.length === 0 ? (
          <div className="text-center py-10 text-slate-400 font-bold">No students found in Class {selectedClass}</div>
        ) : (
          <div className="space-y-3">
            {students.map(student => (
              <div key={student.id} className="bg-white p-4 rounded-2xl border border-slate-200 flex justify-between items-center shadow-sm">
                <div className="min-w-0 pr-2">
                  <p className="font-black text-slate-900 truncate">{student.first_name}</p>
                  <p className="text-xs text-slate-500 font-bold uppercase tracking-tight">
                    Class {student.class} • {student.phone}
                  </p>
                  {!student.is_active && (
                    <p className="text-[10px] text-rose-500 font-bold mt-1 bg-rose-50 inline-block px-1.5 py-0.5 rounded">
                      Disabled: {new Date(student.disabled_at).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => toggleStudentStatus(student.id, student.is_active)}
                  className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider shrink-0 transition-colors ${
                    student.is_active 
                    ? 'bg-emerald-100 text-emerald-700 active:bg-emerald-200' 
                    : 'bg-rose-100 text-rose-700 active:bg-rose-200'
                  }`}
                >
                  {student.is_active ? 'Active' : 'Disabled'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}